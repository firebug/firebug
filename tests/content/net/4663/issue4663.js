function runTest()
{
    FBTest.openNewTab(basePath + "net/4663/issue4663.html", (win) =>
    {
        // 1. Open Firebug
        FBTest.openFirebug(() =>
        {
            // 2. Enable and switch to the Net panel
            FBTest.enableNetPanel(() =>
            {
                var button = win.document.getElementById("sendRequest");

                var config = {
                    tagName: "tr",
                    classes: "netRow category-xhr loaded responseError"
                };
                FBTest.waitForDisplayedElement("net", config, function(row)
                {
                    var sizeCol = row.getElementsByClassName("netSizeCol")[0];

                    var config = {tagName: "table", classes: "sizeInfoTip"};
                    FBTest.waitForDisplayedElement("net", config, function (infoTip)
                    {
                        var expected = /0 B.*0 B.*0 B/;
                        FBTest.compare(expected, infoTip.textContent, "The infotip for the size " +
                            "of the request must contain the correct values");

                        // Hide the infotip by hovering outside of the Size column
                        FBTest.mouseOver(FBTest.getSelectedPanel().panelNode, 0, 0);

                        FBTest.testDone();
                    });

                    // 4. Hover its entry in the Size column
                    FBTest.mouseOver(sizeCol);
                });

                // 3. Click the 'Send request' button
                FBTest.click(button);
            });
        });
    });
}
