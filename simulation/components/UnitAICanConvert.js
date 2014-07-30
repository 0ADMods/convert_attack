
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

	warn("Health: " + health_normalized + " vs. Target Health: " + target_health_normalized);

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
	var convertible = false;     // TODO GetConvertibleClasses
	for each (var convertibleClass in cmpHeal.GetHealableClasses())//GetConvertibleClasses())
	{
		if (cmpIdentity.HasClass(convertibleClass) != -1)
		{
			convertible = true;
		}
	}
	if (!convertible)
		return false;


    warn('The unit '+ target +' can be captured by ' + + ' .');
	return true;

};

Engine.ReRegisterComponentType(IID_UnitAI, "UnitAI", UnitAI);
