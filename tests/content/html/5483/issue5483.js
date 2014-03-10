function runTest()
{
    FBTest.openNewTab(basePath + "html/5483/issue5483.html", function(win)
    {
        // 1. Open Firebug
        FBTest.openFirebug(function ()
        {
            // 2. Switch to the HTML panel
            // 3. Inspect the Firebug logo (#image) inside the blue <div>
            FBTest.selectElementInHtmlPanel("image", function(node)
            {
                var attributes = node.getElementsByClassName("nodeAttr");
                var valueNode = null;
                for (var i = 0; i < attributes.length; i++)
                {
                    var name = attributes[i].getElementsByClassName("nodeName")[0].textContent;
                    if (name === "src")
                    {
                        valueNode = attributes[i].getElementsByClassName("nodeValue")[0];
                        break;
                    }
                }

                if (!FBTest.ok(valueNode, "Value must be displayed within the HTML panel"))
                    FBTest.testDone();

                var config = {
                    tagName: "img",
                    classes: "infoTipImage"
                };

                FBTest.waitForDisplayedElement("html", config, function(node)
                {
                    function verifyImageDimensions()
                    {
                        node.removeEventListener("load", verifyImageDimensions);

                        var imageBox = FW.FBL.getAncestorByClass(node, "infoTipImageBox");
                        var infoTipCaption = imageBox.getElementsByClassName("infoTipCaption")[0].
                            textContent;
                        FBTest.compare("64 x 64", infoTipCaption, "Image dimensions must be displayed");

                        FBTest.testDone();
                    }

                    node.addEventListener("load", verifyImageDimensions);
                });

                // 4. Hover the image URL inside the panel
                FBTest.mouseOver(valueNode);
            });
        });
    });
}
