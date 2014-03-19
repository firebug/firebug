function runTest()
{
    FBTest.openNewTab(basePath + "css/6582/issue6582-2.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("stylesheet");

            var locationButtons = FW.Firebug.chrome.$("fbLocationButtons");
            FBTest.ok(locationButtons.getAttribute("collapsed") != "true",
                "Location button must be visible");

            var message = "There are no rules. You can ";
            FBTest.waitForDisplayedText("stylesheet", message, function()
            {
                var locationButtons = FW.Firebug.chrome.$("fbLocationButtons");
                FBTest.ok(locationButtons.getAttribute("collapsed") != "false",
                    "Location button must be hidden");

                var locationButtons = FW.Firebug.chrome.$("fbToggleCSSEditing");
                FBTest.ok(locationButtons.getAttribute("collapsed") != "false",
                    "Edit button must be hidden");

                FBTest.testDone();
            })

            // Remove all stylesheets
            FBTest.click(win.document.getElementById("removeAllStyleSheets"));
        });
    });
}
