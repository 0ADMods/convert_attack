// Return a boolean on whether a unit can be converted or not
UnitAI.prototype.CanConvert = function(target)
{
	if (!this.TargetIsAlive(target))
		return false;
	
	let cmpIdentity = Engine.QueryInterface(target, IID_Identity);
	if (!cmpIdentity)
		return false;
	return (MatchesClassList(cmpIdentity.GetClassesList(), "Human"));
};

Engine.ReRegisterComponentType(IID_UnitAI, "UnitAI", UnitAI);