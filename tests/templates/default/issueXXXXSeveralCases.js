/*
    1. Replace "XXXX" by number of your issue
    2. Replace "category" by the folder name you put your test case to
    3. Replace "mainPanel" by main panel name
    4. Replace "doSomething" by first step after selecting the main panel
    5. Add the functionality and tests to each case as described in the steps of the HTML file
    6. Remove all template comments
*/
function runTest()
{
    FBTest.sysout("issueXXXX.START");

    FBTest.openNewTab(basePath + "category/XXXX/issueXXXX.html", function(win)
    {
        FBTest.openFirebug();
        FBTest.selectPanel("mainPanel");

        var tests = [];
        tests.push(test0);
        tests.push(test1);

        FBTestFirebug.runTestSuite(tests, function()
        {
            FBTest.testDone("issueXXXX; DONE");
        });
    });
}


function test0(callback)
{
    FBTest.doSomething(function(win)
    {
        // Test functionality must be placed here

        callback();
    });
}

function test1(callback)
{
    FBTest.doSomething(function(win)
    {
        // Test functionality must be placed here

        callback();
    });
}
