function runTest()
{
    FBTest.openNewTab(basePath + "inspector/InspectorTestIframe.htm?url=Issue68BoxRulerExpected.htm", function(win)
    {
        var actualImage, expectedImage,
            ifr = win.document.getElementById('testIframe'),
            width = ifr.contentDocument.body.clientWidth,
            height = ifr.contentDocument.body.clientHeight;

        expectedImage = FBTest.getImageDataFromWindow(ifr.contentWindow, width, height);

        FBTest.openURL(basePath + "inspector/InspectorTestIframe.htm?url=Issue68BoxActual.htm", function(win)
        {
            FBTest.openFirebug(function()
            {
                ifr = win.document.getElementById("testIframe");

                var target = ifr.contentDocument.getElementById("testTarget1");

                // To get full html for expected page break here and use: ifr.contentDocument.documentElement.innerHTML

                FBTest.inspectUsingBoxModelWithRulers(target);

                actualImage = FBTest.getImageDataFromWindow(ifr.contentWindow, width, height);

                FBTest.compare(expectedImage, actualImage, "The screen must be in expected state");
                FBTest.testDone();
            });
        });
    });
}
