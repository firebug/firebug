function runTest()
{
    FBTest.openNewTab(basePath + "css/5277/issue5277.html", function(win)
    {
        var id = "element1";
        var border = win.outerWidth - win.innerWidth;

        // Resize browser window, so the media query doesn't apply
        // and we can make a screenshot of the <div>
        FBTest.setBrowserWindowSize(300 + border, win.outerHeight);
        var elementDisplaySmallWindow = FBTest.getImageDataFromNode(
            win.document.getElementById(id));

        FBTest.openFirebug(function()
        {
            var panel = FBTest.selectPanel("stylesheet");

            FBTest.selectPanelLocationByName(panel, "issue5277.html");

            var rows = panel.panelNode.getElementsByClassName("importRule");
            if (FBTest.compare(1, rows.length, "There must be one @import rule"))
            {
                var rule = rows.item(0);
                FBTest.compare("@import \"issue5277.css\" screen and (min-width: 500px);",
                    rule.textContent, "The @import rule must contain the the media query");

                // Resize browser window, so the media query applies
                // and we can make a screenshot of the <div>
                FBTest.setBrowserWindowSize(600 + border, win.outerHeight);
                var elementDisplayLargeWindow = FBTest.getImageDataFromNode(
                    win.document.getElementById(id));

                FBTest.synthesizeMouse(rule.getElementsByClassName("cssMediaQuery").item(0));
                var editor = panel.panelNode.querySelector(".textEditorInner");

                if (FBTest.ok(editor, "Editor must be available now"))
                {
                    FBTest.compare("screen and (min-width: 500px)", editor.value,
                    "The editor must contain the media query");

                    FBTest.sendString("screen and (min-width: 800px)", editor);

                    // Click outside the CSS selector to stop inline editing
                    FBTest.synthesizeMouse(panel.panelNode, 0, 0);

                    FBTest.compare(elementDisplaySmallWindow,
                        FBTest.getImageDataFromNode(win.document.getElementById(id)),
                        "The div must be blue now");

                    // Resize browser window, so the media query applies again
                    FBTest.setBrowserWindowSize(900 + border, win.outerHeight);

                    FBTest.compare(elementDisplayLargeWindow,
                        FBTest.getImageDataFromNode(win.document.getElementById(id)),
                        "The div must be green now");
                }
            }
            FBTest.testDone();
        });
    });
}
