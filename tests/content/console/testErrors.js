function runTest()
{
    FBTest.openNewTab(basePath + "console/testErrors.html", (win) =>
    {
        FBTest.enablePanels(["console", "script"], () =>
        {
            fireTest(win, 0);
        });
    });
}

function fireTest(win, ith)
{
    var buttons = [
        "syntaxError",
        "shallowError",
        "deepError",
        "throw",
        "uncaughtException1891",
        "domError"
    ];

    var titles = [
        /identifier starts immediately after numeric literal/,
        /foops is not defined/,
        /B3 is not defined/,
        /uncaught exception: hi/,
        /String contains an invalid character/,
        /Not enough arguments/
    ];

    var sources = ["2BeOrNot2Be(40)",
        "",
        /\/\*foo\*\/\s*B3\(\)\;\s*/,
        "",
        "",
        /\s*document\.getElementById\(\)\;\s*/
    ];

    if (ith >= buttons.length)
    {
        FBTest.testDone();
        return;
    }

    var config = {
        tagName: "div",
        classes: "logRow-errorMessage",
        onlyMutations: true
    };

    FBTest.waitForDisplayedElement("console", config, (elt) =>
    {
        FBTest.progress("matched logRow-errorMessage with " + ith, elt);
        checkConsoleLogMessage(buttons[ith], elt, titles[ith], sources[ith]);
        setTimeout(() => fireTest(win, ith + 1));
    });

    FBTest.clickContentButton(win, buttons[ith]);
}

function checkConsoleLogMessage(button, log, expectedTitle, expectedSource)
{
    var title = log.getElementsByClassName("errorTitle")[0];
    var source = log.getElementsByClassName("errorSource")[0];

    FBTest.compare(expectedTitle, title.textContent, "The " + button +
        " error message must be correct.");
    if (expectedSource)
    {
        var isCorrect = FBTest.compare(expectedSource, source.textContent, "The " + button +
            " error source must be correct.");
        if (!isCorrect)
        {
            var min = expectedSource.length < source.textContent.length ?
                expectedSource.length : source.textContent.length;

            for (var i = 0; i < min; i++)
            {
                var expected = expectedSource.charAt(i);
                var was = source.textContent.charAt(i);
                if (expected != was)
                    FBTest.progress(" source differs at " + i + " |" + expected + "| vs |" + was + "|");
            }

            if (expectedSource.length < source.textContent.length)
            {
                FBTest.progress("The error source has " + source.textContent.length +
                    " characters, next charCodeAt is |" + source.textContent.charAt(min) +
                    "|(" + source.textContent.charCodeAt(min) + ")");
            }

            if (expectedSource.length > source.textContent.length)
            {
                FBTest.progress("The expected source has " + expectedSource.length +
                    " characters, next charCodeAt is |" + expectedSource.charAt(min) +
                    "|(" + expectedSource.charCodeAt(min) + ")");
            }
        }
        else
        {
            FBTest.progress("expectedSource is correct");
        }
    }
}
