function runTest()
{
    FBTest.openNewTab(basePath + "console/testErrors.html", function(win)
    {
        FBTest.selectPanel("console");
        FBTest.enableConsolePanel(function(win) // causes reload
        {
           FBTest.selectPanel("console");
           fireTest(win, 0);
        });
    });
}


function fireTest(win, ith)
{
    var buttons = ["syntaxError", "shallowError", "deepError", "throw", "uncaughtException1891"];
    var titles = ["missing ; before statement", "foops is not defined",
                  "B3 is not defined", "uncaught exception: hi", 'String contains an invalid character"  code: "5'];
    var sources = ["2BeOrNot2Be(40)", "", "/*foo*/                    B3();\\r\\n", "", ""];

    if (ith >= buttons.length)
    {
        FBTest.testDone();
        return;
    }

    var panelDoc = FBTest.getPanelDocument();

    var lookForLogRow = new MutationRecognizer(panelDoc.defaultView, 'div', {class: "logRow-errorMessage"});

    lookForLogRow.onRecognize(function sawLogRow(elt)
    {
        FBTest.progress("matched logRow-errorMessage with "+ith, elt);
        checkConsoleLogMessage(buttons[ith], elt, titles[ith], sources[ith]);
        setTimeout(function bindArgs() { return fireTest(win, ith+1); });
    });
    FBTest.progress("waiting for "+lookForLogRow.getDescription());

    var button = win.document.getElementById(buttons[ith]);
    FBTest.progress("clicking "+button.getAttribute('id'));
    FBTest.click(button);
}

function checkConsoleLogMessage(button, log, expectedTitle, expectedSource)
{
    var title = FW.FBL.getElementByClass(log, "errorTitle");
    var source = FW.FBL.getElementByClass(log, "errorSource");

    FBTest.compare(expectedTitle, title.textContent, "The "+button+" error message must be correct.");
    if (expectedSource)
    {
        var isCorrect = FBTest.compare(expectedSource, source.textContent, "The "+button+" error source must be correct.");
        if (!isCorrect)
        {
            var min = expectedSource.length < source.textContent.length ? expectedSource.length : source.textContent.length;
            for (var i = 0; i < min; i++)
            {
                var expected = expectedSource.charAt(i);
                var was = source.textContent.charAt(i);
                if (expected != was) FBTest.progress(" source differs at "+i+" |"+expected+"| vs |"+was+"|");
            }

            if (expectedSource.length < source.textContent.length)
                FBTest.progress("The error source has "+source.textContent.length+" characters, next charCodeAt is |"+source.textContent.charAt(min)+"|("+source.textContent.charCodeAt(min)+")");
            if (expectedSource.length > source.textContent.length)
                FBTest.progress("The expected source has "+expectedSource.length+" characters, next charCodeAt is |"+expectedSource.charAt(min)+"|("+expectedSource.charCodeAt(min)+")");

        }
        else
            FBTest.progress("expectedSource is correct");
    }

}
