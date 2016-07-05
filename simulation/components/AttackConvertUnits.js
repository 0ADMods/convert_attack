

Attack.prototype.bonusesSchema = 
	"<optional>" +
		"<element name='Bonuses'>" +
			"<zeroOrMore>" +
				"<element>" +
					"<anyName/>" +
					"<interleave>" +
						"<optional>" +
							"<element name='Civ' a:help='If an entity has this civ then the bonus is applied'><text/></element>" +
						"</optional>" +
						"<element name='Classes' a:help='If an entity has all these classes then the bonus is applied'><text/></element>" +
						"<element name='Multiplier' a:help='The attackers attack strength is multiplied by this'><ref name='nonNegativeDecimal'/></element>" +
					"</interleave>" +
				"</element>" +
			"</zeroOrMore>" +
		"</element>" +
	"</optional>";

Attack.prototype.preferredClassesSchema =
	"<optional>" +
		"<element name='PreferredClasses' a:help='Space delimited list of classes preferred for attacking. If an entity has any of theses classes, it is preferred. The classes are in decending order of preference'>" +
			"<attribute name='datatype'>" +
				"<value>tokens</value>" +
			"</attribute>" +
			"<text/>" +
		"</element>" +
	"</optional>";

Attack.prototype.restrictedClassesSchema =
	"<optional>" +
		"<element name='RestrictedClasses' a:help='Space delimited list of classes that cannot be attacked by this entity. If target entity has any of these classes, it cannot be attacked'>" +
			"<attribute name='datatype'>" +
				"<value>tokens</value>" +
			"</attribute>" +
			"<text/>" +
		"</element>" +
	"</optional>";



// Extend the Attack component schema:
Attack.prototype.Schema += 
	// TODO: finish the convert attack
  	"<optional>" +
		"<element name='Convert'>" +
			"<interleave>" +
				"<element name='MaxRange' a:help='Maximum attack range (in metres)'><ref name='nonNegativeDecimal'/></element>" +
				"<element name='MinRange' a:help='Minimum attack range (in metres)'><ref name='nonNegativeDecimal'/></element>" +
				"<optional>"+
					"<element name='ElevationBonus' a:help='give an elevation advantage (in meters)'><ref name='nonNegativeDecimal'/></element>" +
				"</optional>" +
				"<element name='PrepareTime' a:help='Time from the start of the attack command until the attack actually occurs (in milliseconds). This value relative to RepeatTime should closely match the \"event\" point in the actor&apos;s attack animation'>" +
					"<data type='nonNegativeInteger'/>" +
				"</element>" +
				"<element name='RepeatTime' a:help='Time between attacks (in milliseconds). The attack animation will be stretched to match this time'>" +
					"<data type='positiveInteger'/>" +
				"</element>" +
				Attack.prototype.bonusesSchema +
				Attack.prototype.preferredClassesSchema +
				Attack.prototype.restrictedClassesSchema +
			"</interleave>" +
		"</element>" +
	"</optional>";

Attack.prototype.GetAttackTypes = function()
{
	return ["Melee", "Ranged", "Capture", "Convert"].filter(type => !!this.template[type]);
};

/**
 * Attack the target entity. This should only be called after a successful range check,
 * and should only be called after GetTimers().repeat msec has passed since the last
 * call to PerformAttack.
 */
Attack.prototype.PerformAttack = function(type, target)
{
	// If this is a ranged attack, then launch a projectile
	if (type == "Ranged")
	{
		let cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
		let turnLength = cmpTimer.GetLatestTurnLength()/1000;
		// In the future this could be extended:
		//  * Obstacles like trees could reduce the probability of the target being hit
		//  * Obstacles like walls should block projectiles entirely

		// Get some data about the entity
		let horizSpeed = +this.template[type].ProjectileSpeed;
		let gravity = 9.81; // this affects the shape of the curve; assume it's constant for now

		let spread = +this.template.Ranged.Spread;
		spread = ApplyValueModificationsToEntity("Attack/Ranged/Spread", spread, this.entity);

		//horizSpeed /= 2; gravity /= 2; // slow it down for testing

		let cmpPosition = Engine.QueryInterface(this.entity, IID_Position);
		if (!cmpPosition || !cmpPosition.IsInWorld())
			return;
		let selfPosition = cmpPosition.GetPosition();
		let cmpTargetPosition = Engine.QueryInterface(target, IID_Position);
		if (!cmpTargetPosition || !cmpTargetPosition.IsInWorld())
			return;
		let targetPosition = cmpTargetPosition.GetPosition();

		let relativePosition = Vector3D.sub(targetPosition, selfPosition);
		let previousTargetPosition = Engine.QueryInterface(target, IID_Position).GetPreviousPosition();

		let targetVelocity = Vector3D.sub(targetPosition, previousTargetPosition).div(turnLength);
		// The component of the targets velocity radially away from the archer
		let radialSpeed = relativePosition.dot(targetVelocity) / relativePosition.length();

		let horizDistance = targetPosition.horizDistanceTo(selfPosition);

		// This is an approximation of the time ot the target, it assumes that the target has a constant radial
		// velocity, but since units move in straight lines this is not true.  The exact value would be more
		// difficult to calculate and I think this is sufficiently accurate.  (I tested and for cavalry it was
		// about 5% of the units radius out in the worst case)
		let timeToTarget = horizDistance / (horizSpeed - radialSpeed);

		// Predict where the unit is when the missile lands.
		let predictedPosition = Vector3D.mult(targetVelocity, timeToTarget).add(targetPosition);

		// Compute the real target point (based on spread and target speed)
		let range = this.GetRange(type);
		let cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
		let elevationAdaptedMaxRange = cmpRangeManager.GetElevationAdaptedRange(selfPosition, cmpPosition.GetRotation(), range.max, range.elevationBonus, 0);
		let distanceModifiedSpread = spread * horizDistance/elevationAdaptedMaxRange;

		let randNorm = this.GetNormalDistribution();
		let offsetX = randNorm[0] * distanceModifiedSpread * (1 + targetVelocity.length() / 20);
		let offsetZ = randNorm[1] * distanceModifiedSpread * (1 + targetVelocity.length() / 20);

		let realTargetPosition = new Vector3D(predictedPosition.x + offsetX, targetPosition.y, predictedPosition.z + offsetZ);

		// Calculate when the missile will hit the target position
		let realHorizDistance = realTargetPosition.horizDistanceTo(selfPosition);
		timeToTarget = realHorizDistance / horizSpeed;

		let missileDirection = Vector3D.sub(realTargetPosition, selfPosition).div(realHorizDistance);

		// Launch the graphical projectile
		let cmpProjectileManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_ProjectileManager);
		let id = cmpProjectileManager.LaunchProjectileAtPoint(this.entity, realTargetPosition, horizSpeed, gravity);

		let playerId = Engine.QueryInterface(this.entity, IID_Ownership).GetOwner();
		cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
		cmpTimer.SetTimeout(this.entity, IID_Attack, "MissileHit", timeToTarget * 1000, {
			"type": type,
			"target": target,
			"position": realTargetPosition,
			"direction": missileDirection,
			"projectileId": id,
			"playerId":playerId
		});
	}
	else if (type == "Capture")
	{
		let multiplier = this.GetAttackBonus(type, target);
		let cmpHealth = Engine.QueryInterface(target, IID_Health);
		if (!cmpHealth || cmpHealth.GetHitpoints() == 0)
			return;
		multiplier *= cmpHealth.GetMaxHitpoints() / (0.1 * cmpHealth.GetMaxHitpoints() + 0.9 * cmpHealth.GetHitpoints());

		let cmpOwnership = Engine.QueryInterface(this.entity, IID_Ownership);
		if (!cmpOwnership || cmpOwnership.GetOwner() == -1)
			return;

		let owner = cmpOwnership.GetOwner();
		let cmpCapturable = Engine.QueryInterface(target, IID_Capturable);
		if (!cmpCapturable || !cmpCapturable.CanCapture(owner))
			return;

		let strength = this.GetAttackStrengths("Capture").value * multiplier;
		if (cmpCapturable.Reduce(strength, owner))
			Engine.PostMessage(target, MT_Attacked, {
				"attacker": this.entity,
				"target": target,
				"type": type,
				"damage": strength
			});
	}
	else if (type == "Convert")
	{
        
		let cmpOwnership = Engine.QueryInterface(target, IID_Ownership);
		if (!cmpOwnership)
			return;
		let cmpOwnership2 = Engine.QueryInterface(this.entity, IID_Ownership);
		if (!cmpOwnership2)
			return;

		let isImmediatelyIntegrated = true;
		let cmpUnitAi = Engine.QueryInterface(this.entity, IID_UnitAI);
		let owner = cmpOwnership.GetOwner();
		let cmpCapturable = Engine.QueryInterface(target, IID_Capturable);
		if (!cmpCapturable || !cmpCapturable.CanCapture(owner))
		{
			if (isImmediatelyIntegrated)
			{
				// Fully convert to a normal unit of your own, the original ethnicity still recognizable.
				cmpOwnership.SetOwner(cmpOwnership2.GetOwner());
				warn('Unit ' + this.entity + ' (Owner: '+ cmpOwnership +') immediately integrated target: ' + target + ' (Owner: '+ cmpOwnership2 +' ).');
				let cmpTargetEntityPlayer = QueryOwnerInterface(target, IID_Player);
				let cmpPlayer = QueryOwnerInterface(this.entity, IID_Player);
				Engine.PostMessage(this.entity, MT_OwnershipChanged, { "entity": target,
			"from": cmpTargetEntityPlayer.playerID, "to": cmpPlayer.playerID });
			}
			else
			{
				let cmpTargetUnitAi = Engine.QueryInterface(target, IID_UnitAI);
				if (cmpTargetUnitAi) 
				{
					// Take prisoner of war (make it either a prisoner, i.e. garrison or keep it with guards, or a slave worker). Only change accessories or clothes.
					// TODO Trigger guard function: i.e. make the captives/slaves guard their capturer.
					if (cmpTargetUnitAi.isGuardOf())
						cmpTargetUnitAi.RemoveGuard();
					cmpTargetUnitAi.UnitFsmSpec["Order.Guard"]({ target:target_entity });
					// TODO Change Actor or add slave robe or adapt other props.
					 
				}
			}
			Engine.PostMessage(target, MT_OwnershipChanged, { "entity": this.entity });
		}		
		else 
			warn("Can't capture: " + target);

	}
	else
	{
		// Melee attack - hurt the target immediately
		Damage.CauseDamage({
			"strengths": this.GetAttackStrengths(type),
			"target": target,
			"attacker": this.entity,
			"multiplier": this.GetAttackBonus(type, target),
			"type":type
		});
	}
	// TODO: charge attacks (need to design how they work)
};

Engine.ReRegisterComponentType(IID_Attack, "Attack",  Attack);
