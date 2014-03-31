// Test entry point.
function runTest()
{
    FBTest.clearCache();

    FBTest.openNewTab(basePath + "script/1425/issue1425.html", function(win)
    {
        var isOpen = FBTest.isFirebugOpen();
        FBTest.sysout("onNewPage starts with isFirebugOpen:"+isOpen+" in "+win.location);
        if (!isOpen)
            FBTest.pressToggleFirebug();

        FBTest.enableScriptPanel(function reloadIt(win)
        {
            FBTest.progress("reloaded, ready to go");

            var panel = FW.Firebug.chrome.selectPanel("script");
            FBTest.progress("Navigated to "+panel.name+" panel");

            // Select proper JS file.
            var found = FBTest.selectPanelLocationByName(panel, "main.js");
            FBTest.compare(found, true, "The main.js should be found");

            FBTest.waitForDisplayedText("script", "MapLoadingIndicator", function(row)
            {
                var panel = FW.Firebug.chrome.getSelectedPanel();
                var selectedLocationDescription = panel.getObjectDescription(panel.location);
                FBTest.compare("main.js", selectedLocationDescription.name,
                    "The selected location must be main.js");

                // Verify text on line 1143
                var source1143 = "initialize:function(config){";
                var line1143 = panel.scriptView.editor.editorObject.getLine(1142);
                FBTest.compare(source1143, line1143, "The source code at line 1143 verified.");

                FBTest.testDone();
            });
        });
    });
}
