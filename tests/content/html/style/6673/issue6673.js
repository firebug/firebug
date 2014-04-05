function runTest()
{
    FBTest.openNewTab(basePath + "html/style/6673/issue6673.html", (win) =>
    {
        // 1. Open Firebug
        FBTest.openFirebug(() =>
        {
            // 2. Switch to the HTML panel and there to the Style side panel
            // 3. Inspect the blue <div>
            FBTest.selectElementInHtmlPanel("element", () =>
            {
                var panelNode = FBTest.selectPanel("css").panelNode;

                FBTest.getCSSProp("#element", "background-color", (prop) =>
                {
                    var value = prop.getElementsByClassName("cssPropValue")[0];

                    var config = {
                        tagName: "div",
                        classes: "infoTipColorBox"
                    };

                    FBTest.waitForDisplayedElement("css", config, function (infoTip)
                    {
                        FBTest.compare("rgb(120, 140, 255)",
                            infoTip.firstChild.style.backgroundColor,
                            "Infotip must display the correct color");

                        // Hover something else
                        FBTest.mouseOver(panelNode, 0, 0);

                        FBTest.testDone();
                    });

                    // 4. Hover the currentcolor value of the background-color property within the
                    // Style side panel
                    FBTest.mouseOver(value);
                })
            });
        });
    });
}
