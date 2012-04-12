var versionChecker = Cc["@mozilla.org/xpcom/version-comparator;1"].getService(Ci.nsIVersionComparator);
var appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo);
var FF3p5OrLess = versionChecker.compare(appInfo.version, "3.5.*") <= 0;
var FF4OrHigher = versionChecker.compare(appInfo.version, "4.0b8") >= 0;
var win;

function runTest()
{
    FBTest.sysout("1603 runTest starts");

    if (FBTest.FirebugWindow)
        FBTest.ok(true, "We have the Firebug Window: "+FBTest.FirebugWindow.location);
    else
        FBTest.ok(false, "No Firebug Window");

    FBTest.progress("Version dependent test, version "+appInfo.version+" is "+
        (FF3p5OrLess?"3.5 or less":"newer than 3.5")+" ="+
        versionChecker.compare(appInfo.version, "3.5*"));

    FBTest.openNewTab(basePath + "script/singleStepping/index.html", function()
    {
        // Open Firebug UI, enable Script panel, reload and start first test.
        FBTest.openFirebug();
        FBTest.clearCache();
        FBTest.selectPanel("script");
        FBTest.enableScriptPanel(function callbackOnReload(testWindow) {
            win = testWindow;
            selectFile();
        });
    });
}

var fileName = "index.html";
var breakOnNextLineNo = 2;

function selectFile()
{
    FBTest.progress("selectFile");

    // Select proper JS file.
    var panel = FBTest.getSelectedPanel();

    var found = FBTest.selectPanelLocationByName(panel, fileName);
    FBTest.compare(found, true, "The "+fileName+" should be found");
    if (found)
        breakOnNext(panel);
    else
        FBTest.testDone("issue1603.DONE");
}

function breakOnNext(panel)
{
    FBTest.clickBreakOnNextButton(FW.Firebug.chrome);
    FBTest.progress("The breakOnNext button was pushed");

    var button = FW.Firebug.chrome.$("fbBreakOnNextButton");
    FBTest.compare("false", button.getAttribute("breakable"), "The button is armed for break")

    FBTest.progress("Listen for exeline true, meaning the breakOnNext hit");

    FBTest.waitForBreakInDebugger(FW.Firebug.chrome,
        breakOnNextLineNo, false, checkBreakOnNext);

    var testPageButton = win.document.getElementById("clicker");
    FBTest.click(testPageButton);
}

function checkBreakOnNext()
{
    stepInto();
}

var stepIntoLineNo = (FF3p5OrLess || FF4OrHigher) ? 14 : 13;

function stepInto()
{
    FBTest.waitForBreakInDebugger(FW.Firebug.chrome,
        stepIntoLineNo, false, checkStepInto);

    FBTest.progress("Press single step button");
    FBTest.clickToolbarButton(FW.Firebug.chrome, "fbStepIntoButton");
};

var stepIntoFileName = "index.html";

function checkStepInto()
{
    var panel = FBTest.getSelectedPanel();
    var name = panel.getObjectDescription(panel.location).name;
    FBTest.compare(stepIntoFileName, name, "StepInto should land in " + stepIntoFileName);
    stepOver();
};

function stepOver()
{
    FBTest.waitForBreakInDebugger(FW.Firebug.chrome,
        stepOverLineNo, false, checkStepOver);

    FBTest.progress("Press single over button");
    FBTest.clickToolbarButton(FW.Firebug.chrome, "fbStepOverButton");
}

var stepOverLineNo = (FF3p5OrLess || FF4OrHigher) ? 15 : 14;
var stepOverFileName = "index.html";

function checkStepOver()
{
    var panel = FBTest.getSelectedPanel();
    var name = panel.getObjectDescription(panel.location).name;
    FBTest.compare(stepOverFileName, name, "StepOver should land in " +
        stepOverFileName);

    stepOut();
};

function stepOut()
{
    FBTest.waitForBreakInDebugger(FW.Firebug.chrome,
        stepOutLineNo, false, checkstepOut);

    FBTest.progress("Press single StepOut button");
    FBTest.clickToolbarButton(FW.Firebug.chrome, "fbStepOutButton");
}

var stepOutLineNo = 2;
var stepOutFileName = "onclick";

function checkstepOut()
{
    var panel = FBTest.getSelectedPanel();
    var name = panel.getObjectDescription(panel.location).name.split('/')[0];
    FBTest.sysout("panel.location.getObjectDescription().name: " +
            panel.getObjectDescription(panel.location).name, panel.getObjectDescription(panel.location));
    FBTest.compare(stepOutFileName, name, "StepOut should land in " +
        stepOutFileName);

    var row = FBTest.getSourceLineNode(stepOutLineNo);
    if (!row)
        FBTest.sysout("Failing row is "+row.parentNode.innerHTML, row);

    FBTest.clickContinueButton();
    FBTest.progress("The continue button was pushed");

    FBTest.testDone("singleStepping.DONE");
}
