// 1. Open the testcase, open Firebug, enable & select the Console panel.
// 2. Click the Execute Test button.
// 3. Scroll to top.
// 4. Switch to the HTML panel.
// 5. Click the Execute Test button.
// 6. Switch back to Console tab
// 7. The Console panel scroll position must be at the top.

var theWindow;
function runTest()
{
    FBTest.openNewTab(basePath + "console/2122/issue2122.html", function()
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                FBTest.selectPanel("console");

                theWindow = win;

                var tests = [];
                tests.push(test0);
                tests.push(test1);
                tests.push(test2);
                tests.push(test3);

                FBTest.runTestSuite(tests, function()
                {
                    FBTest.testDone();
                });
            });
        });
    });
}

// ************************************************************************************************
// Test logic implementation. The entire test takes > 10 sec to execute so, there must be
// some log/trace messages during the execution to break test-timeout.

function test0(callback)
{
    FBTest.progress("issue2122; Console panel selected, start logging.");

    executeTest(theWindow, function()
    {
        scrollToTop();
        callback();
    });
};

function test1(callback)
{
    FBTest.progress("issue2122; Select HTML panel");

    FBTest.selectPanel("html");
    callback();
};

function test2(callback)
{
    FBTest.progress("issue2122; HTML panel selected, start logging.");

    executeTest(theWindow, function()
    {
        FBTest.selectPanel("console");
        callback();
    });
}

function test3(callback)
{
    FBTest.progress("issue2122; Console panel selected, check scroll position.");

    FBTest.ok(isScrolledToTop(), "The Console panel must be scrolled to the top.");
    callback();
}

// ************************************************************************************************

function executeTest(win, callback)
{
    function listener(event)
    {
        testButton.removeEventListener("TestDone", listener, true);
        callback();
    };

    var testButton = win.document.getElementById("testButton");
    testButton.addEventListener("TestDone", listener, true);

    FBTest.click(testButton);
}

// ************************************************************************************************

function isScrolledToTop()
{
    var panel = FBTest.getPanel("console");
    FBTest.progress("scrollTop: " + panel.panelNode.scrollTop);
    return (panel.panelNode.scrollTop == 0);
}

function scrollToBottom()
{
    var panel = FBTest.getPanel("console");
    return FW.FBL.scrollToBottom(panel.panelNode);
}

function scrollToTop()
{
    var panel = FBTest.getPanel("console");
    return panel.panelNode.scrollTop = 0;
}
