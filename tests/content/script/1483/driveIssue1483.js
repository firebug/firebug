var fileName = "index.js";
var lineNo = 5;

function runTest()
{
    FBTest.sysout("issue1483.START");

    if (FBTest.FirebugWindow)
        FBTest.ok(true, "We have the Firebug Window: "+FBTest.FirebugWindow.location);
    else
        FBTest.ok(false, "No Firebug Window");

    FBTest.sysout("dom.breakpoints; START");
    FBTest.openNewTab(basePath + "script/1483/issue1483.html", function(win)
    {
        // Open Firebug UI, enable Script panel, reload and start first test.
        FBTest.openFirebug();
        FBTest.clearCache();
        FBTest.selectPanel("script");
        FBTest.enableScriptPanel(function (testWindow) {
            win = testWindow;
            selectFile();
        });
    });
}

function selectFile()
{
    // Select proper JS file.
    var panel = FW.Firebug.chrome.getSelectedPanel();

    var found = FBTest.selectPanelLocationByName(panel, fileName);
    FBTest.compare(found, true, "The "+fileName+" should be found");
    if (found)
    {
        FBTest.selectSourceLine(panel.location.href, lineNo, "js");
        setBreakpoint();
    }
    else
    {
        FBTest.testDone("issue1483.DONE");
    }
}

function setBreakpoint(event)
{
    var panel = FW.Firebug.chrome.getSelectedPanel();
    panel.toggleBreakpoint(lineNo);

    // use chromebug to see the elements that make up the row
    var row = FBTest.getSourceLineNode(lineNo);
    FBTest.compare("true", row.getAttribute('breakpoint'), "Line "+lineNo+" should have a breakpoint set");

    secondReload(FW.Firebug.chrome);
};

function secondReload(chrome)
{
    FBTest.waitForBreakInDebugger(chrome, lineNo, true, function wereDone()
    {
        FBTest.progress("Remove breakpoint");
        var panel = chrome.getSelectedPanel();

        panel.toggleBreakpoint(lineNo);

        var row = FBTest.getSourceLineNode(lineNo, chrome);
        if (!FBTest.compare("false", row.getAttribute('breakpoint'), "Line "+lineNo+" should NOT have a breakpoint set"))
            FBTest.sysout("Failing row is "+row.parentNode.innerHTML, row);

        FBTest.clickContinueButton(chrome);

        FBTest.progress("The continue button is pused");

        FBTest.testDone("issue1483.DONE");
    });

    FBTest.reload( function noOP() {});
}
