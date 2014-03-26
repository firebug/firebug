function runTest()
{
    FBTest.openNewTab(basePath + "css/computed/5879/issue5879.html", (win) =>
    {
        // 1. Open Firebug
        FBTest.openFirebug(() =>
        {
            FBTest.setSidePanelWidth(520);

            // 2. Switch to the HTML panel and there to the Computed side panel
            // 3. Inspect the blue <div> with the Firebug icon inside
            FBTest.selectElementInHtmlPanel("element", function(node)
            {
                var prop = FBTest.getComputedProperty("background-image");
                var computedPropValue = prop.getElementsByClassName("stylePropValue")[0];

                var expectedComputedValue = cropString("url(\"" + basePath +
                    "css/computed/5879/veryLongImageFileNameForTestingStringCroppingWithin" +
                    "ComputedSidePanel.png\")");

                FBTest.compare(expectedComputedValue, computedPropValue.textContent,
                    "Computed value must be cropped");

                // 4. Expand the property
                FBTest.click(prop);

                var propValue = prop.nextSibling.getElementsByClassName("stylePropValue")[0];

                var expectedStyleTraceValue = cropString("url(\"veryLongImageFileNameForTesting" +
                    "StringCroppingWithinComputedSidePanel.png\")");
                FBTest.compare(expectedStyleTraceValue, propValue.textContent,
                    "Value in style trace must be cropped");
                FBTest.testDone();
            });
        });
    });
}

function cropString(string)
{
    var limit = FBTest.getPref("stringCropLength");
    if (limit > 0)
        return FW.FBL.cropString(string, limit);

    return string;
}