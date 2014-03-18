function runTest()
{
    FBTest.openNewTab(basePath + "shortcuts/firebug.html", function(win)
    {
        FBTest.ok(!FBTest.isFirebugActive(), "Firebug must be suspended");

        // Activate inspector
        FBTest.sendShortcut("c", {shiftKey: true, accelKey: true});
        FBTest.compare("inBrowser", FBTest.getFirebugPlacement(), "Firebug must be inBrowser");
        FBTest.ok(FBTest.isFirebugActive(), "Firebug must be active");
        FBTest.ok(FBTest.isInspectorActive(), "HTML Inspector must be inspecting");

        // Deactivate inspector
        FBTest.sendShortcut("c", {shiftKey: true, accelKey: true});
        FBTest.compare("inBrowser", FBTest.getFirebugPlacement(), "Firebug must be inBrowser");
        FBTest.ok(FBTest.isFirebugActive(), "Firebug must be active");
        FBTest.ok(!FBTest.isInspectorActive(), "HTML Inspector must be deactivated");

        FBTest.testDone();
    });
}
