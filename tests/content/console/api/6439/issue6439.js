function runTest()
{
    FBTest.openNewTab(basePath + "console/api/6439/issue6439.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var tasks = new FBTest.TaskList();
                var float = 4.3152;

                // No precision specified
                tasks.push(FBTest.executeCommandAndVerify, "console.log('amount: %f', " + float + ")",
                    "amount: 4.3152", "div", "logRow-log");

                // 2 digits precision
                tasks.push(FBTest.executeCommandAndVerify, "console.log('amount: %.2f', " + float + ")",
                    "amount: 4.32", "div", "logRow-log");

                // 1 digit precision
                tasks.push(FBTest.executeCommandAndVerify, "console.log('amount: %.1f', " + float + ")",
                    "amount: 4.3", "div", "logRow-log");

                // 0 digits precision
                tasks.push(FBTest.executeCommandAndVerify, "console.log('amount: %.0f', " + float + ")",
                    "amount: 4", "div", "logRow-log");

                // 5 digits precision
                tasks.push(FBTest.executeCommandAndVerify, "console.log('amount: %.5f', " + float + ")",
                    "amount: 4.31520", "div", "logRow-log");

                tasks.run(function()
                {
                    FBTest.testDone();
                });
            });
        });
    });
}
