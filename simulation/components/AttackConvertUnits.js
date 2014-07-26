

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
    warn('GetAttackTypes: this: ' + this + ' template: ' + this.template + '   is_convert_in_template: ' + this.template.Convert);
	var ret = [];
	if (this.template.Convert) ret.push("Convert");
	if (this.template.Charge) ret.push("Charge");
	if (this.template.Melee) ret.push("Melee");
	if (this.template.Ranged) ret.push("Ranged");
	return ret;
};


/**
 * Attack the target entity. This should only be called after a successful range check,
 * and should only be called after GetTimers().repeat msec has passed since the last
 * call to PerformAttack.
 */
Attack.prototype.PerformAttack = function(type, target)
{
    warn('type: ' + type + '  target: ' + target);
	// If this is a ranged attack, then launch a projectile
	if (type == "Ranged")
	{
		var cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
		var turnLength = cmpTimer.GetLatestTurnLength() / 1000;
		// In the future this could be extended:
		//  * Obstacles like trees could reduce the probability of the target being hit
		//  * Obstacles like walls should block projectiles entirely

		// Get some data about the entity
		var horizSpeed = +this.template[type].ProjectileSpeed;
		var gravity = 9.81; // this affects the shape of the curve; assume it's constant for now

		var spread = +this.template.Ranged.Spread;
		spread = ApplyValueModificationsToEntity("Attack/Ranged/Spread", spread, this.entity);

		//horizSpeed /= 2; gravity /= 2; // slow it down for testing

		var cmpPosition = Engine.QueryInterface(this.entity, IID_Position);
		if (!cmpPosition || !cmpPosition.IsInWorld())
			return;
		var selfPosition = cmpPosition.GetPosition();
		var cmpTargetPosition = Engine.QueryInterface(target, IID_Position);
		if (!cmpTargetPosition || !cmpTargetPosition.IsInWorld())
			return;
		var targetPosition = cmpTargetPosition.GetPosition();

		var relativePosition = Vector3D.sub(targetPosition, selfPosition);
		var previousTargetPosition = Engine.QueryInterface(target, IID_Position).GetPreviousPosition();

		var targetVelocity = Vector3D.sub(targetPosition, previousTargetPosition).div(turnLength);
		// the component of the targets velocity radially away from the archer
		var radialSpeed = relativePosition.dot(targetVelocity) / relativePosition.length();

		var horizDistance = targetPosition.horizDistanceTo(selfPosition);

		// This is an approximation of the time ot the target, it assumes that the target has a constant radial 
		// velocity, but since units move in straight lines this is not true.  The exact value would be more 
		// difficult to calculate and I think this is sufficiently accurate.  (I tested and for cavalry it was 
		// about 5% of the units radius out in the worst case)
		var timeToTarget = horizDistance / (horizSpeed - radialSpeed);

		// Predict where the unit is when the missile lands.
		var predictedPosition = Vector3D.mult(targetVelocity, timeToTarget).add(targetPosition);

		// Compute the real target point (based on spread and target speed)
		var range = this.GetRange(type);
		var cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
		var elevationAdaptedMaxRange = cmpRangeManager.GetElevationAdaptedRange(selfPosition, cmpPosition.GetRotation(), range.max, range.elevationBonus, 0);
		var distanceModifiedSpread = spread * horizDistance/elevationAdaptedMaxRange;

		var randNorm = this.GetNormalDistribution();
		var offsetX = randNorm[0] * distanceModifiedSpread * (1 + targetVelocity.length() / 20);
		var offsetZ = randNorm[1] * distanceModifiedSpread * (1 + targetVelocity.length() / 20);

		var realTargetPosition = new Vector3D(predictedPosition.x + offsetX, targetPosition.y, predictedPosition.z + offsetZ);

		// Calculate when the missile will hit the target position
		var realHorizDistance = realTargetPosition.horizDistanceTo(selfPosition);
		var timeToTarget = realHorizDistance / horizSpeed;

		var missileDirection = Vector3D.sub(realTargetPosition, selfPosition).div(realHorizDistance);

		// Make the arrow appear to land slightly behind the target so that arrows landing next to a guys foot don't count but arrows that go through the torso do
		var graphicalPosition = Vector3D.mult(missileDirection, 2).add(realTargetPosition);
		// Launch the graphical projectile
		var cmpProjectileManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_ProjectileManager);
		var id = cmpProjectileManager.LaunchProjectileAtPoint(this.entity, realTargetPosition, horizSpeed, gravity);

		var playerId = Engine.QueryInterface(this.entity, IID_Ownership).GetOwner()
		var cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
 		cmpTimer.SetTimeout(this.entity, IID_Attack, "MissileHit", timeToTarget*1000, {"type": type, "target": target, "position": realTargetPosition, "direction": missileDirection, "projectileId": id, "playerId":playerId});
    }
	else if (type == "Convert")
	{
        
		var cmpOwnership = Engine.QueryInterface(target, IID_Ownership);
		if (!cmpOwnership)
			return;
        //warn('Owner Target: ' + cmpOwnership);

		var cmpOwnership2 = Engine.QueryInterface(this.entity, IID_Ownership);
		if (!cmpOwnership2)
			return;
        //warn('Owner Source: ' + cmpOwnership2);

		var isImmediatelyIntegrated = true;
		var cmpUnitAi = Engine.QueryInterface(this.entity, IID_UnitAI);
		if (cmpUnitAi.CanCapture(target))
		{
			if (isImmediatelyIntegrated)
			{
				// Fully convert to a normal unit of your own, the original ethnicity still recognizable.
				cmpOwnership.SetOwner(cmpOwnership2.GetOwner());
				warn('Unit ' + this.entity + ' (Owner: '+ cmpOwnership +') immediately integrated target: ' + target + ' (Owner: '+ cmpOwnership2 +' ).');
			}
			else
			{
				var cmpTargetUnitAi = Engine.QueryInterface(target, IID_UnitAI);
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
		Damage.CauseDamage({"strengths":this.GetAttackStrengths(type), "target":target, "attacker":this.entity, "multiplier":this.GetAttackBonus(type, target), "type":type});
	}
	// TODO: charge attacks (need to design how they work)

};



/*
// Get nearby entities and define variables
//var nearEnts = Damage.EntitiesNearPoint(data.origin, data.radius, data.playersToDamage);

Attack.prototype.GetNearbyEntities = function(startEnt, range, friendlyFire)
{
	var cmpPlayerManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager);
	var cmpOwnership = Engine.QueryInterface(this.entity, IID_Ownership);
	var owner = cmpOwnership.GetOwner();
	var cmpPlayer = Engine.QueryInterface(cmpPlayerManager.GetPlayerByID(owner), IID_Player);
	var numPlayers = cmpPlayerManager.GetNumPlayers();
	var players = [];
	
	for (var i = 1; i < numPlayers; ++i)
	{	
		// Only target enemies unless friendly fire is on
		if (cmpPlayer.IsEnemy(i) || friendlyFire)
			players.push(i);
	}
	
	var rangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
	return rangeManager.ExecuteQuery(startEnt, 0, range, players, IID_DamageReceiver);
}
*/

UnitAI.prototype.CanCapture = function(target)
{
    // The healthier the capturing unit the easier for it to capture a target. 
	var cmpHealth = Engine.QueryInterface(this.entity, IID_Health);
	if (!cmpHealth)// || cmpHealth.IsUnhealable()) //<-- include this right side or in the formula.
        return false;
    var health_normalized = cmpHealth.GetHitpoints() / cmpHealth.GetMaxHitpoints();

    // The healthier a unit the more difficult to capture it. 
	// Verify that the target is not at max health. Then a unit has to come pretty close: 
    // TODO replace with formula that takes distance into account. Include all enemy units.
	var target_cmpHealth = Engine.QueryInterface(target, IID_Health);
	if (!target_cmpHealth)// || cmpHealth.IsUnhealable()) //<-- include this right side or in the formula.
        return false;
    var target_health_normalized = target_cmpHealth.GetHitpoints() / target_cmpHealth.GetMaxHitpoints();

    // Nearby units get captured easier.
    var distance = DistanceBetweenEntities(this.entity, target);
/*TODO  Get distance for every unit close by. If performance allows.
 * var thisCmpPosition = Engine.QueryInterface(this.entity, IID_Position);
	var s = thisCmpPosition.GetPosition();

	var t = targetCmpPosition.GetPosition();

	var h = s.y-t.y+range.elevationBonus;
	var maxRangeSq = 2*range.max*(h + range.max/2);

	if (maxRangeSq < 0)
		return false;

	var cmpUnitMotion = Engine.QueryInterface(this.entity, IID_UnitMotion);
	return cmpUnitMotion.IsInTargetRange(target, range.min, Math.sqrt(maxRangeSq));
	return maxRangeSq >= distanceSq && range.min*range.min <= distanceSq;
*/
    var this_moveDirection_normalized = 1 ;//cmpUnitMotion.GetDirection(); //or determine yourself from last and this location.
    var target_moveDirection_normalized = 1;// assume enemy is not fleeing for now.



    // Units which are surrounded by many enemies and few friendly units get captured easier.
/*	var cmpRanged = Engine.QueryInterface(this.entity, iid);
	if (!cmpRanged)
		return false;*/
	//var range = cmpRanged.GetRange(type);
    //GetUnitsInRange(); TODO
    var friendlyToEnemyWithinRangeRatio = 1;

    // fleeing units get captured more easily.
	var cmpUnitMotion = Engine.QueryInterface(this.entity, IID_UnitMotion);
    var easyCatchBonus = 0;
    if (target_moveDirection_normalized == -1 * this_moveDirection_normalized) { 
	    //return cmpUnitMotion.IsInTargetRange(target, range.min, range.max);
        easyCatchBonus = 10;
    }
    var base_chance = 50;
    //warn[(]friendlyToEnemyWithinRangeRatio + ' * distance: ' + distance + '  health_normalized: ' + health_normalized + ' - ' + target_health_normalized + ' target_health_normalized');
    // Is this all enough to capture the unit and make it prisoner of the unit that captured it? (use Guard function for this in the meantime, but only for units)
    var chanceForConversionSuccess = friendlyToEnemyWithinRangeRatio * (base_chance + (health_normalized - target_health_normalized) * 100 - distance + easyCatchBonus);
    /*
    var captureLuck = 50;
    var toBeCapturedLuck = 50;
    if (toBeCapturedLuck > 90) {
    }
    */   
    //warn[(]'Chance for Conversion Success: ' + chanceForConversionSuccess);
    var chanceIncreaseByRandomLastHopeOppositionBoost = 5; //TODO randomize.
    var chanceMinimumForConversionSuccess = 30;
    if (chanceForConversionSuccess < (chanceMinimumForConversionSuccess + chanceIncreaseByRandomLastHopeOppositionBoost)) {
        return false;
    }
    // I had a formula somewhere in the Forum. Have to look for it.



	// Verify that the target has no unconvertible class (e.g. a Hero?)
    //
	// Verify that we're able to respond to Heal commands
	var cmpHeal = Engine.QueryInterface(this.entity, IID_Heal);
	if (!cmpHeal) 
        return false;

    // TODO create those classes (schema + xml). For now use healable classes.
	var cmpIdentity = Engine.QueryInterface(target, IID_Identity);
	if (!cmpIdentity)
		return false;
	for each (var unhealableClass in cmpHeal.GetUnhealableClasses())
	{
		if (cmpIdentity.HasClass(unhealableClass) != -1)
		{
			return false;
		}
	}

	// Verify that the target is a convertible class:
	var convertible = false;
	for each (var convertibleClass in cmpHeal.GetHealableClasses())//GetConvertibleClasses())
	{
		if (cmpIdentity.HasClass(convertibleClass) != -1)
		{
			convertible = true;
		}
	}
	if (!convertible)
		return false;


    //warn[(]'Conversion was successful.');
	return true;

};

Engine.ReRegisterComponentType(IID_Attack, "Attack",  Attack);
