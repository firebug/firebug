
/**
 * Test for CompilationUnit#setBreakpoint(line) for a JavaScript file external
 * to its HTML file, and CompilationUnit#getBreakpoints().
 */

function runTest()
{
    var browser = new FW.Firebug.BTI.Browser(); // TODO
    var url = FBTest.getHTTPURLBase()+"bti/compilationunit/testScripts.html";
    var cuURL = FBTest.getHTTPURLBase()+"bti/compilationunit/simpleExternal.js";
    browser.addEventListener("onToggleBreakpoint", function(breakpoint)
    {
        // once the breakpoint is installed, this call back should be triggered
        var cu = breakpoint.getCompilationUnit();
        FBTest.compare(cuURL, cu.getURL(), "breakpoint's compilation unit incorrect");
        FBTest.ok(FW.Firebug.BTI.Breakpoint.INSTALLED === breakpoint.getState(),
            "breakpoint should be installed");
        FBTest.ok(1 == breakpoint.getLineNumber(), "breakpoint should be on line 1");
        FBTest.testDone();
    });
    browser.addEventListener("onContextCreated", function(context)
    {
        FBTest.progress("setBreakpoint, context created");
        FBTest.compare(context.getURL(), url, "URL of newly created context should be " + url);
        FBTest.progress("setBreakpoint, retrieving compilation units");
        context.getCompilationUnits(function(units){
            FBTest.progress("setBreakpoint, compilation units retrieved");
            unit = context.getCompilationUnit(cuURL);
            FBTest.ok(unit, "compilation unit does not exist:" + cuURL);
            var bps = unit.getBreakpoints();
            FBTest.compare(0, bps.length, "Should be no breakpoints yet");
            var bp = unit.setBreakpoint(1);
            bps = unit.getBreakpoints();
            FBTest.compare(1, bps.length, "Should be 1 breakpoint now");
            FBTest.ok(bp === bps[0], "Breakpoint retrieved should be the one just created");
        });
    });
    FBTest.progress("setBreakpoint, open test page " + url);
    FBTest.openNewTab(url, function(win)
    {
        FBTest.progress("setBreakpoint, new tab opened " + url);
    });
}
