function runTest()
{
    FBTest.sysout("872.START");
    FBTest.openNewTab(basePath + "console/872/main.html", function(win)
    {
        FBTest.selectPanel("console");
        FBTest.enableConsolePanel(function(win) // causes reload
        {
            FBTest.selectPanel("console");
           fireTest(win);
        });
    });
}


function fireTest(win)
{
    var panelDoc = FBTest.getPanelDocument();

    var lookForLogRow = new MutationRecognizer(panelDoc.defaultView, 'div', {class: "logRow-errorMessage"});

    lookForLogRow.onRecognize(function sawLogRow(elt)
    {
        FBTest.progress("matched logRow-errorMessage", elt);
        checkConsoleLogMessage(elt, /This is an error from an iframe!/, null);
        setTimeout(function allowCleanup()
        {
            FBTest.testDone("872.done");
        });
    });

    var button = win.document.getElementById("refreshIFrame");
    FBTest.progress("testing "+button.getAttribute('id'));
    FBTest.click(button);
}

function checkConsoleLogMessage(log, expectedTitle, expectedSource)
{
    var title = FW.FBL.getElementByClass(log, "errorTitle");
    var source = FW.FBL.getElementByClass(log, "errorSource");

    FBTest.compare(expectedTitle, title.textContent, "The error message must be correct.");
    if (expectedSource)
        FBTest.compare(expectedSource, source.textContent, "The error source must be correct.");
}
