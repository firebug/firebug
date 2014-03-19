function runTest()
{
    FBTest.setPref("commandLineShowCompleterPopup", true);
    FBTest.openNewTab(basePath + "console/completion/3421/issue3421.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var panel = FW.Firebug.chrome.selectPanel("console");

                var tasks = new FBTest.TaskList();
                tasks.push(testExpression, "a={}.", false);
                tasks.push(testExpression, "1+i", true);
                tasks.push(testExpression, "{}i", true);
                tasks.push(testExpression, "if(false)document.", true);
                tasks.push(testExpression, "my_var.", true);
                tasks.push(testExpression, "0<i", true);
                tasks.push(testExpression, "$myvar.", true);
                tasks.push(testExpression, "myvar2.", false);

                tasks.run(function()
                {
                    FBTest.ok(typeof(window.a) == "undefined",
                        "There must not be a new global");

                    FBTest.testDone();
                });
            });
        });
    });
}

function testExpression(callback, expr, popupOpened)
{
    FBTest.typeCommand(expr);

    setTimeout(function()
    {
        FBTest.compare(popupOpened, isCompletionPopupOpen(),
            "The completion popup should " + (popupOpened ? "" : "not ") +
            "be there for: " + expr);

        var doc = FW.Firebug.chrome.window.document;
        var cmdLine = doc.getElementById("fbCommandLine");
        cmdLine.value = "";

        callback();
    });
}

// ************************************************************************************************
// xxxHonza: These should be polished and moved into FBTest namespace.

function isCompletionPopupOpen()
{
    var doc = FW.Firebug.chrome.window.document;
    var popup = doc.getElementById("fbCommandLineCompletionList");
    return popup.state == "open";
}
