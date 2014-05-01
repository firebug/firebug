function runTest()
{
    var div = document.createElement("div");

    var parentDiv = document.createElement("div");
    var childDiv1 = document.createElement("div");
    var childDiv2 = document.createElement("div");

    parentDiv.appendChild(childDiv1);
    parentDiv.appendChild(childDiv2);
    document.body.appendChild(parentDiv);

    var xpath = FW.FBL.getElementTreeXPath(childDiv1);

    FBTest.compare("/html/body/div/div[1]", xpath, "Verify xPath");

    FBTest.testDone();
}
