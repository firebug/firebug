// 1. Open Firebug, enable & select the Console panel.
// 2. Enter anything (like '1+2') into the console several times, enough to
//    overflow the console space.
// 3. The Console panel scroll position must be at the bottom.
function runTest()
{
    // Step 1.
    FBTest.openNewTab(basePath + "console/2694/issue2694.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function()
            {
                executeSetOfCommands(40, function()
                {
                    FBTest.ok(isScrolledToBottom(), "The Console panel must be scrolled to the bottom.");
                    FBTest.testDone();
                });
            });
        });
    });
}

// ************************************************************************************************

function executeSetOfCommands(counter, callback)
{
    if (counter > 0)
    {
        FBTest.executeCommand("1+" + counter);
        setTimeout(function() {
            executeSetOfCommands(--counter, callback);
        }, 50);
    }
    else
    {
        callback();
    }
}

function isScrolledToBottom()
{
    var panel = FBTest.getPanel("console");
    return FW.FBL.isScrolledToBottom(panel.panelNode);
}
