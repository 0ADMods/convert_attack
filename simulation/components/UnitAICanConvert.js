// Return a boolean on whether a unit can be converted or not
UnitAI.prototype.CanConvert = function(target)
{
	// Verify that we're able to respond to Heal commands (if you can heal it, you can convert it)
	let cmpHeal = Engine.QueryInterface(this.entity, IID_Heal);
	if (!cmpHeal) 
        return false;

	let cmpIdentity = Engine.QueryInterface(target, IID_Identity);
	if (!cmpIdentity)
		return false;

	// Verify that the target is a convertible (read: Healable) class
	let convertible = false;
	for (let convertibleClass of cmpHeal.GetHealableClasses())
	{
		if (cmpIdentity.HasClass(convertibleClass) != -1)
		{
			convertible = true;
		}
	}
    warn('The unit ' + target + ' can be captured by ' + this.entity + ' .');
	return convertible;

};

Engine.ReRegisterComponentType(IID_UnitAI, "UnitAI", UnitAI);