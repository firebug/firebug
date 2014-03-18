function runTest()
{
    FBTest.openNewTab(basePath + "commandLine/5042/issue5042.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var doc = FW.Firebug.chrome.window.document;
                var browserDoc = FW.Firebug.Firefox.getTabBrowser().ownerDocument;
                var cmdLine = doc.getElementById("fbCommandLine");

                cmdLine.focus();

                if (FBTest.compare("fbMainContainer", browserDoc.activeElement.id, "Firebug must be focused"))
                {
                    FBTest.ok(cmdLine == FW.FBL.getAncestorByClass(doc.activeElement, "fbCommandLine"),
                        "Command Line must be focused");

                    FBTest.synthesizeKey("VK_TAB", null, win);

                    FBTest.ok("fbMainContainer" != browserDoc.activeElement.id ||
                        cmdLine != FW.FBL.getAncestorByClass(doc.activeElement, "fbCommandLine"),
                        "Command Line must not be focused anymore");
                }

                FBTest.testDone();
            });
        });
    });
}
