function runTest()
{
    FBTest.sysout("issue5042.START");

    FBTest.openNewTab(basePath + "commandLine/5042/issue5042.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("console");

        FBTest.enableConsolePanel(function(win)
        {
            var doc = FW.Firebug.chrome.window.document;
            var browserDoc = FW.Firebug.Firefox.getTabBrowser().ownerDocument;
            var cmdLine = doc.getElementById("fbCommandLine");

            cmdLine.focus();

            if (FBTest.compare("fbMainContainer", browserDoc.activeElement.id, "Firebug must be focussed"))
            {
                FBTest.ok(cmdLine == FW.FBL.getAncestorByClass(doc.activeElement, "fbCommandLine"),
                    "Command Line must be focussed");
    
                FBTest.synthesizeKey("VK_TAB", null, win);
    
                FBTest.ok("fbMainContainer" != browserDoc.activeElement.id ||
                    cmdLine != FW.FBL.getAncestorByClass(doc.activeElement, "fbCommandLine"),
                    "Command Line must not be focussed anymore");
            }

            FBTest.testDone("issue5042.DONE");
        });
    });
}
