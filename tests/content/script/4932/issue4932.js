function runTest()
{
    var url = basePath + "script/4932/issue4932.html";
    FBTest.openNewTab(url, function(win)
    {
        FBTest.enableScriptPanel(function(win)
        {
            FBTest.progress("Wait till the iframe is loaded");

            FBTest.selectSourceLine(url, 1, "js", null, function(row)
            {
                row = FW.FBL.getChildByClass(row, "firebug-line");

                var expected = /function funcTest\(\) \{\}\s*/;
                FBTest.compare(expected, row.textContent,
                    "The script panel must show expected source: " + row.textContent);

                FBTest.testDone();
            });
        });
    });
}
