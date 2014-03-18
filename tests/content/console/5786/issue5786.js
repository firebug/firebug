function runTest()
{
    FBTest.openNewTab(basePath + "console/5786/issue5786.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var tasks = new FBTest.TaskList();

                // jQuery like array
                tasks.push(FBTest.executeCommandAndVerify, "$('a')",
                    "Object[a detail?id=5786, a.a1, a.a2, a.a3]",
                    "span", "objectBox-array");

                // HTMLCollection
                tasks.push(FBTest.executeCommandAndVerify,
                    "document.getElementsByTagName('a')",
                    "HTMLCollection[a detail?id=5786, a.a1, a.a2, a.a3]",
                    "span", "objectBox-array");

                // NodeList
                tasks.push(FBTest.executeCommandAndVerify,
                    "document.querySelectorAll('a')",
                    "NodeList[a detail?id=5786, a.a1, a.a2, a.a3]",
                    "span", "objectBox-array");

                // Array
                tasks.push(FBTest.executeCommandAndVerify,
                    "[].slice.call(document.querySelectorAll('a'))",
                    "[a detail?id=5786, a.a1, a.a2, a.a3]",
                    "span", "objectBox-array");

                tasks.run(function()
                {
                    FBTest.testDone();
                });
            });
        });
    });
}
