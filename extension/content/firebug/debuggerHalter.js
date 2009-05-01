
function debuggerHalter()
{
	if (FBTrace.DBG_BP)
		FBTrace.sysout("debuggerHalter enter");
	debugger;
	if (FBTrace.DBG_BP)
		FBTrace.sysout("debuggerHalter exit");
}