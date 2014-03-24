function runTest()
{
    FBTest.setPref("filterSystemURLs", false);

    FBTest.openNewTab(basePath + "net/breakpoints/breakOnXHR.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enablePanels(["net", "script"], function()
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
    FBTest.sysout("net.breakpoints.CB; addBreakpoint");

    var panel = FBTest.getSelectedPanel();

    panel.context.netProgress.breakpoints.breakpoints = [];

    // Wait till the XHR request is visible
    FBTest.waitForDisplayedElement("net", null, (row) =>
    {
        FBTest.sysout("net.breakpoints.CB; XHR visible");

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

    FBTest.sysout("net.breakpoints.CB; XHR executed");
}

function createBreakpoint(panel, repObject, callback)
{
    FBTest.sysout("net.breakpoints.CB; createBreakpoint", repObject);

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
    FBTest.sysout("net.breakpoints.CB; breakOnXHR");

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
    FBTest.progress("net.breakpoints.CB; setCondition");

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
    FBTest.progress("net.breakpoints.CB; removeBreakpoint");

    var panel = FBTest.selectPanel("net");

    var row = panel.panelNode.getElementsByClassName("netRow category-xhr hasHeaders loaded")[0];
    FBTest.sysout("net.breakpoints.CB; removeBreakpoint, row", row.repObject);

    // Remove breakpoint
    panel.breakOnRequest(row.repObject);

    var bpUrl = basePath + "net/breakpoints/process1.php";
    var bp = panel.context.netProgress.breakpoints.findBreakpoint(bpUrl);
    FBTest.ok(!bp, "XHR breakpoint for 'process1.php' must not exist.");

    callback();
}
