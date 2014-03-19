function runTest()
{
    FBTest.openNewTab(basePath + "css/computed/3207/issue3207.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.selectPanel("html");
            FBTest.selectElementInHtmlPanel("element1", function(sel)
            {
                FBTest.sysout("issue3207; selection: ", sel);

                var sidePanel = FBTest.selectSidePanel("computed");

                var propNames = sidePanel.panelNode.querySelectorAll(".stylePropName");
                var i = 0;
                while (propNames[i].textContent != "font-family")
                    i++;

                if (FBTest.ok(i < propNames.length,
                    "'font-family' property must be listed inside the Computed side panel"))
                {
                    var propValue = propNames[i].parentNode.querySelector(".stylePropValue").textContent;
                    FBTest.compare(/^"Trebuchet MS",[\s\u200b]*Helvetica,[\s\u200b]*sans-serif$/, propValue,
                        "Property value must be '\"Trebuchet MS\",Helvetica,sans-serif'");
                }

                sidePanel = FBTest.selectSidePanel("css");
                var cssSelector = sidePanel.panelNode.querySelector(".cssSelector");
                FBTest.executeContextMenuCommand(cssSelector, "fbNewCSSProp", function()
                {
                    var editor = sidePanel.panelNode.querySelector(".textEditorInner");

                    if (FBTest.ok(editor, "Editor must be available now"))
                    {
                        FBTest.sendString("font-family", editor);
                        FBTest.sendKey("TAB", editor);

                        editor = sidePanel.panelNode.querySelector(".textEditorInner");
                        FBTest.sendString("Georgia", editor);

                        // Click outside the CSS selector to stop inline editing
                        FBTest.synthesizeMouse(cssSelector, 100, 0);
                    }

                    // Wait till the new value is displayed in the Style panel
                    // and then switch into the Computed panel.
                    FBTest.waitForDisplayedText("css", "Georgia", function()
                    {
                        var sidePanel = FBTest.selectSidePanel("computed");

                        propNames = sidePanel.panelNode.querySelectorAll(".stylePropName");
                        propValue = propNames[i].parentNode.querySelector(".stylePropValue").textContent;
                        FBTest.compare("Georgia", propValue, "Property value must be 'Georgia'");

                        FBTest.testDone();
                    });

                    // xxxHonza: terrible hack, we need to figure out why the
                    // CSS panel is selected at this moment.
                    FBTest.selectPanel("html");
                });
            });
        });
    });
}
