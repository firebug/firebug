function runTest()
{
    FBTest.sysout("issue4932.START");

    FBTest.openNewTab(basePath + "script/4932/issue4932.html", function(win)
    {
        FBTest.selectPanel("script");
        FBTest.enableScriptPanel(function(win)
        {
            var config = {tagName: "span", classes: "sourceRowText"};
            FBTest.waitForDisplayedElement("script", config, function(row)
            {
                var expected = /function funcTest\(\) \{\}\s*/;
                FBTest.compare(expected, row.textContent,
                    "The script panel must show expected source");

                FBTest.testDone("issue4932.DONE");
            });
        });
    });
}
