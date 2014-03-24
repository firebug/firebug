function runTest()
{
    FBTest.openNewTab(basePath + "net/5324/issue5324.html", (win) =>
    {
        FBTest.enableNetPanel(() =>
        {
            FBTest.waitForDisplayedElement("net", null, (row) =>
            {
                var label = row.getElementsByClassName("netProtocolLabel")[0];
                FBTest.compare(/SPDY/, label.innerHTML, "It must be a SPDY request");
                FBTest.testDone();
            });

            FBTest.clickContentButton(win, "testButton");
        });
    });
}
