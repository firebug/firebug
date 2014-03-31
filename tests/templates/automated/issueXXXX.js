/*
    1. Replace "XXXX" by number of your issue
    2. Replace "category" by the folder name you put your test case to
    3. Replace "mainPanel" by main panel name
    4. Replace "doSomething" by first step after selecting the main panel
    5. Add the functionality and tests as described in the steps of the HTML file
    6. Remove all template comments
*/
function runTest()
{
    FBTest.openNewTab(basePath + "category/XXXX/issueXXXX.html", (win) =>
    {
        FBTest.openFirebug(() =>
        {
            FBTest.selectPanel("mainPanel");

            FBTest.doSomething(() =>
            {
                // Test functionality must be placed here

                FBTest.testDone();
            });
        });
    });
}
