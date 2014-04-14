function runTest()
{
    FBTest.openNewTab(basePath + "html/style/4470/issue4470.html", (win) =>
    {
        // Open Firebug
        FBTest.openFirebug(() =>
        {
            // Switch to html panel
            FBTest.selectPanel("html");

            // Inspect #element1
            FBTest.selectElementInHtmlPanel("element1", () =>
            {
                // Select Style side panel
                var panelNode = FBTest.selectPanel("css").panelNode;

                // Get background-image property of #element1
                FBTest.getCSSProp("#element1", "background-image", (prop) =>
                {
                    var value = prop.getElementsByClassName("cssPropValue")[0];

                    var config = {
                        tagName: "div",
                        classes: "infoTipColorBox"
                    };

                    FBTest.waitForDisplayedElement("css", config, function (infoTip)
                    {
                        FBTest.compare(/linear-gradient\(135deg,\s*#788cff,\s*#b4c8ff\)/i, infoTip.innerHTML,
                            "The infotip must contain the same value as specified in the " +
                            "style 'background-image'.");

                        // Hover somthing else
                        FBTest.mouseOver(panelNode, 0, 0);
                        
                        FBTest.testDone();
                    });

                    FBTest.mouseOver(value);
                });
            });
        });
    });
}
