function runTest()
{
    FBTest.openNewTab(basePath + "commandLine/api/dirxml.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var config = {tagName: "div", classes: "logRow logRow-dirxml"};
                FBTest.waitForDisplayedElement("console", config, function(row)
                {
                    var xml = /\s*<div\s*id=\"content\"\s*style=\"display:\s*none;\"><span>a<\/span><span><span>b<\/span><\/span><\/div>/;
                    FBTest.compare(xml, row.textContent, "XML must be properly displayed.");
                    FBTest.testDone();
                });

                FBTest.executeCommand("dirxml(document.getElementById('content'));");
            });
        });
    });
}
