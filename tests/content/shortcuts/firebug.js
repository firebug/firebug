function runTest()
{
    FBTest.openNewTab(basePath + "shortcuts/firebug.html", function(win)
    {
        FBTest.ok(!FBTest.isFirebugActive(), "Firebug must be suspended");

        // Open Firebug
        FBTest.sendShortcut("VK_F12");
        FBTest.ok(FBTest.isFirebugOpen(), "Firebug UI must be opened by now");
        FBTest.compare("inBrowser", FBTest.getFirebugPlacement(), "Firebug must be inBrowser");
        FBTest.ok(FBTest.isFirebugActive(), "Firebug must be activated");

        // Minimize UI
        FBTest.sendShortcut("VK_F12");
        FBTest.compare("minimized", FBTest.getFirebugPlacement(), "Firebug must be minimized");
        FBTest.ok(FBTest.isFirebugActive(), "Firebug must be activated");

        // Open again and shutdown.
        FBTest.sendShortcut("VK_F12");
        FBTest.sendShortcut("VK_F12", {shiftKey: true});
        FBTest.compare("inBrowser", FBTest.getFirebugPlacement(), "Firebug must be inBrowser");
        FBTest.ok(!FBTest.isFirebugActive(), "Firebug must be suspended");

        FBTest.testDone();
    });
}
