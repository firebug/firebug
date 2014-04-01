function runTest()
{
    FBTest.openNewTab(basePath + "html/style/3230/issue3230.html", (win) =>
    {
        // 1. Open Firebug
        FBTest.openFirebug(() =>
        {
            // 2. Switch to the HTML panel and there to the Style side panel
            FBTest.selectPanel("css");

            // 3. Inspect the blue <div> (#element1)
            FBTest.selectElementInHtmlPanel("element1", () =>
            {
                // 4. Set the Style side panel option ':hover'
                FBTest.setPanelOption("css", "toggleHoverState", () =>
                {
                    var doc = win.document;
                    var element = doc.getElementById("element1");
                    var cs = win.getComputedStyle(element);

                    var expected = "linear-gradient(-45deg, " +
                        "rgb(120, 255, 140), rgb(180, 255, 200))";
                    FBTest.compare(expected, cs.backgroundImage,
                        "Background of the '#element' element must be green");

                    // 5. Hover the red <div> (#element2)
                    FBTest.mouseOver(doc.getElementById("element2"));

                    cs = win.getComputedStyle(element);

                    FBTest.compare(expected, cs.backgroundImage,
                        "Background of the '#element' element must still be green");

                    // Do not hover 'element2' anymore
                    FBTest.mouseOver(doc.body, 0, 0);

                    FBTest.testDone();
                })
            });
        });
    });
}
