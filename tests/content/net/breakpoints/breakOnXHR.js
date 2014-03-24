function runTest()
{
    FBTest.setPref("filterSystemURLs", true);

    FBTest.openNewTab(basePath + "net/breakpoints/breakOnXHR.html", (win) =>
    {
        FBTest.openFirebug(() =>
        {
            FBTest.enablePanels(["net", "script"], () =>
            {
                // A suite of asynchronous tests.
                var tasks = new FBTest.TaskList();
                tasks.push(addBreakpoint, win);
                tasks.push(breakOnXHR, win, 45);
                tasks.push(setCondition, win);
                tasks.push(breakOnXHR, win, 45);
                tasks.push(removeBreakpoint, win);

                tasks.run(function()
                {
                    FBTest.testDone();
                });
            });
        });
    });
}

// ************************************************************************************************
// Asynchronous Tests

function addBreakpoint(callback, win)
{
    FBTest.sysout("net.breakpoints; addBreakpoint");

    var panel = FBTest.getSelectedPanel();
    panel.context.netProgress.breakpoints.breakpoints = [];

    // Wait till the XHR request is visible
    FBTest.waitForDisplayedElement("net", null, (row) =>
    {
        FBTest.sysout("net.breakpoints; XHR visible");

        function waitForRepObject()
        {
            if (!row.repObject)
            {
                setTimeout(waitForRepObject, 50);
                return;
            }
            createBreakpoint(panel, row.repObject, callback);
        }
        waitForRepObject();
    });

    FBTest.clickContentButton(win, "executeRequest1");

    FBTest.sysout("net.breakpoints; XHR executed");
}

function createBreakpoint(panel, repObject, callback)
{
    FBTest.sysout("net.breakpoints; createBreakpoint", repObject);

    var bpUrl = basePath + "net/breakpoints/process1.php";
    var breakpoints = panel.context.netProgress.breakpoints;

    var bp = breakpoints.findBreakpoint(bpUrl);
    FBTest.ok(!bp, "XHR breakpoint for 'process1.php' must not exist.");

    // Create a new breakpoint.
    panel.breakOnRequest(repObject);

    bp = breakpoints.findBreakpoint(bpUrl);
    FBTest.ok(bp, "XHR breakpoint for 'process1.php' must exist.");

    callback();
}

function breakOnXHR(callback, win, lineNo)
{
    FBTest.sysout("net.breakpoints; breakOnXHR");

    FBTest.selectPanel("script");

    // Wait for break.
    var chrome = FW.Firebug.chrome;
    FBTest.waitForBreakInDebugger(chrome, lineNo, false, function(sourceRow)
    {
        FBTest.sysout("net.breakpoints; Break on XHR OK");
        FBTest.clickContinueButton(chrome);
        FBTest.progress("The continue button is pushed");
        callback();
    });

    FBTest.clickContentButton(win, "executeRequest1");
}

function setCondition(callback, win)
{
    FBTest.progress("net.breakpoints; setCondition");

    var panel = FBTest.selectPanel("net");
    var bpUrl = basePath + "net/breakpoints/process1.php";
    var bp = panel.context.netProgress.breakpoints.findBreakpoint(bpUrl);

    // The breakpoint must exist now, set condition.
    if (FBTest.ok(bp, "XHR breakpoint for 'process1.php' must exist."))
        bp.condition = "param == 1";

    callback();
}

function removeBreakpoint(callback, win)
{
    FBTest.progress("net.breakpoints; removeBreakpoint");

    var panel = FBTest.selectPanel("net");

    var row = FW.FBL.getElementByClass(panel.panelNode, "netRow",
        "category-xhr", "hasHeaders", "loaded");
    FBTest.sysout("net.breakpoints; removeBreakpoint, row", row.repObject);

    // Remove breakpoint
    panel.breakOnRequest(row.repObject);

    var bpUrl = basePath + "net/breakpoints/process1.php";
    var bp = panel.context.netProgress.breakpoints.findBreakpoint(bpUrl);
    FBTest.ok(!bp, "XHR breakpoint for 'process1.php' must not exist.");

    callback();
}
