function runTest()
{
    FBTest.openNewTab(basePath + "dom/2772/issue2772.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.selectPanel("dom");

            FBTest.reload(function()
            {
                var panel = FBTest.getPanel("dom");
                FBTest.waitForDOMProperty("_testObject", function(row)
                {
                    FBTest.waitForDOMProperty("innerObject", function(row)
                    {
                        FBTest.click(FW.FBL.getElementByClass(row, "objectLink-object"));

                        FBTest.reload(function()
                        {
                            var panel = FBTest.getPanel("dom");
                            FBTest.waitForDOMProperty("yetAnotherObject", function(row)
                            {
                                FBTest.ok(true, "yetAnotherObject object must be visible now.");
                                FBTest.testDone();
                            }, true);
                        });
                    }, true);

                    FBTest.click(FW.FBL.getElementByClass(row, "memberLabel", "userLabel"));
                }, true);
            });
        });
    });
}
