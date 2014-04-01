function runTest()
{
    FBTest.openNewTab(basePath + "css/5987/issue5987.html", (win) =>
    {
        FBTest.openFirebug(() =>
        {
            var panel = FBTest.selectPanel("stylesheet");

            FBTest.selectPanelLocationByName(panel, "issue5987.html");

            var rule = FBTest.getStyleRulesBySelector("#image")[0];
            var propValue = rule.getElementsByClassName("cssPropValue")[0];

            var config = {
                tagName: "img",
                classes: "infoTipImage"
            };

            FBTest.waitForDisplayedElement("stylesheet", config, function(image)
            {
                if (FBTest.compare(basePath + "css/5987/images/imageWith()And'InItsName.png",
                    image.getAttribute("src"), "Image URL must be correct"))
                {
                    function verifyImageDimensions()
                    {
                        image.removeEventListener("load", verifyImageDimensions);
    
                        var imageBox = FW.FBL.getAncestorByClass(image, "infoTipImageBox");
                        var infoTipCaption = imageBox.getElementsByClassName("infoTipCaption")[0].
                            textContent;
                        FBTest.compare("64 x 64", infoTipCaption, "Image dimensions must be displayed");
    
                        FBTest.testDone();
                    }
    
                    image.addEventListener("load", verifyImageDimensions);
                }
                else
                {
                    FBTest.testDone();
                }
            });

            FBTest.mouseOver(propValue, 0, 0);
        });
    });
}
