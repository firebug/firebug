// Test entry point.
function runTest()
{
    FBTest.sysout("issue1425.START");
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

            var panel = FW.Firebug.chrome.getSelectedPanel();
            var selectedLocationDescription = panel.getObjectDescription(panel.location);
            FBTest.compare("main.js", selectedLocationDescription.name,
                "The selected location must be main.js");

            var sourceBox = panel.getSourceBoxByURL(panel.getObjectLocation(panel.location));
            var sourceViewport =  FW.FBL.getChildByClass(sourceBox, 'sourceViewport');
            if (sourceViewport)
            {
                var rows = sourceViewport.childNodes;

                FBTest.ok(rows.length > 1, "The script view must not be empty.");
                if (rows.length < 1)
                    FBTest.testDone("issue1425.DONE");

                // Scroll to the line 1
                // (the panel can be scrolled to the last time position by default).
                var url = panel.getObjectLocation(panel.location);
                FBTest.selectSourceLine(url, 1, "js");

                // Verify text on line 1.
                var source1 = "function MapLoadingIndicator(m){\n";
                FBTest.compare(source1, rows[1].firstChild.nextSibling.textContent,
                    "Verify source on line 1");

                // Scroll to 1143
                FBTest.progress("Scroll to line 1143");
                var url = panel.getObjectLocation(panel.location);
                FBTest.selectSourceLine(url, 1143, "js");

                var tries = 5;
                var checking = setInterval( function checkScrolling()
                {
                    FBTest.progress("check scrolling, remaining tries: "+tries);

                    // Look for line 1143
                    var row1143 = FBTest.getSourceLineNode(1143, FW.Firebug.chrome);
                    if (!row1143 && --tries)
                        return;

                    // Check 1143
                    FBTest.ok(row1143, "The row 1143 must exist");
                    if (row1143)
                    {
                        var source1143 = "initialize:function(config){\n";
                        FBTest.compare(source1143, row1143.firstChild.nextSibling.textContent,
                            "The source code at line 1143 verified.");
                    }
                    else
                    {
                        FBTest.sysout("Where is 1143 row in "+url, rows);
                    }

                    clearInterval(checking);
                    FBTest.testDone("issue1425.DONE");
                }, 50);
            }
            else
            {
                FBTest.testDone("issue1425.DONE");
            }
        });
    });
}
