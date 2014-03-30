function runTest()
{
    FBTest.openNewTab(basePath + "net/7298/issue7298.html", (win) =>
    {
        FBTest.openFirebug(() =>
        {
            FBTest.enableNetPanel(() =>
            {
                var config = {
                    tagName: "tr",
                    classes: "netRow category-undefined hasHeaders loaded "
                };

                FBTest.waitForDisplayedElement("net", config, (row) =>
                {
                    FBTest.click(row);

                    var svgTab = row.parentNode.getElementsByClassName("netInfoSVGTab")[0];

                    if (FBTest.ok(svgTab, "SVG tab must exist"))
                    {
                        FBTest.waitForDisplayedText("net", "http://creativecommons.org/ns#", (nodeTag) =>
                        {
                            var expected = /4AAQSkZJRgABAgEAqQCpAAD/;
                            var svgContent = FW.FBL.getAncestorByClass(nodeTag, "netInfoSVGText");
                            FBTest.compare(expected, svgContent.textContent, "SVG source must be displayed");
                            FBTest.testDone();
                        })

                        FBTest.click(svgTab);
                    }
                    else
                    {
                        FBTest.testDone();
                    }
                })
            });
        });
    });
}
