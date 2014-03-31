function runTest()
{
    FBTest.openNewTab(basePath + "html/6744/issue6744.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.selectPanel("html");

            FBTest.selectElementInHtmlPanel("test", function(win)
            {
                var chrome = FW.Firebug.chrome;
                var elementPathItem = chrome.window.document.
                    getElementsByClassName("panelStatusLabel")[0];

                FBTest.compare("div#test.a.b.c", elementPathItem.label,
                    "The label of the node inside the Element Path must be 'div#test.a.b.c'");

                FBTest.testDone();
            });
        });
    });
}
