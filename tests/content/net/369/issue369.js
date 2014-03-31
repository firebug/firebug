function runTest()
{
    FBTest.openNewTab(basePath + "net/369/issue369.htm", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableNetPanel(function(win)
            {
                var panel = FBTest.selectPanel("net");

                win.makeRequest1(onRequest);
                win.makeRequest2(onRequest);
                win.makeRequest3(onRequest);
                win.makeRequest4(onRequest);
                // xxxHonza: Not implemented yet.
                //win.makeRequest5(onRequest);
                //win.makeRequest6(onRequest);
            });
        });
    });
}

var counter = 0;
function onRequest(request)
{
    if (++counter >= 4)
        setTimeout(verifyContent, 400);
}

function verifyContent()
{
    var panelNode = FBTest.getPanel("net").panelNode;
    var rows = FBTest.expandElements(panelNode, "netRow", "category-xhr");
    var tabs = FBTest.expandElements(panelNode, "netInfoJSONTab");

    FBTest.ok(rows.length == 4, "There must be 4 requests in the Net panel.");
    FBTest.ok(tabs.length == 4, "There must be 4 JSON tabs in the net panel.");

    if (rows.length != 4 || tabs.length != 4)
        return FBTest.testDone();

    for (var i=0; i<rows.length; i++)
    {
        var row = rows[i];
        var nextSibling = row.nextSibling;
        var jsonBody = FW.FBL.getElementByClass(nextSibling, "netInfoJSONText", "netInfoText");
        var domTable = FW.FBL.getElementByClass(jsonBody, "domTable");

        var label = FW.FBL.getElementByClass(row, "netFullHrefLabel", "netHrefLabel");

        FBTest.ok(domTable, "JSON tree must exist for: " + label.textContent);
        FBTest.ok(textContent, domTable.textContent, "JSON data must be properly displayed.");
    }

    FBTest.testDone();
}

// ************************************************************************************************

var jsonString = "{'firstName':'John','lastName':'Smith','address':{" +
    "'streetAddress':'21 2nd Street','city':'New York','state':'NY','postalCode':10021}," +
    "'phoneNumbers':['212 555-1234','646 555-4567']}";

var textContent = "addressObject streetAddress=21 2nd Street city=New York state=NY" +
    "firstName\"John\"lastName\"Smith\"phoneNumbers[\"212 555-1234\", \"646 555-4567\" 0=" +
    "212 555-1234 1=646 555-4567]";

// JSON response #1
function requestHandler1(metadata, response) {
    response.setHeader("Content-Type", "application/json", false);
    response.write(jsonString);
}

// JSON response #2
function requestHandler2(metadata, response) {
    response.setHeader("Content-Type", "application/json", false);
    response.write("somefunc(" + jsonString + ")");
}

// JSON response #3
function requestHandler3(metadata, response) {
    response.setHeader("Content-Type", "application/json", false);
    response.write("/*-secure-\n" + jsonString + "\n*/");
}

// JSON response #4
function requestHandler4(metadata, response) {
    response.setHeader("Content-Type", "application/json", false);
    response.write("while (true); &&&START&&& " + jsonString + " &&&END&&&");
}

// JSON response #5
function requestHandler5(metadata, response) {
    response.setHeader("Content-Type", "application/json", false);
    response.write("var myObject = " + jsonString + ";");
}

// JSON response #6
function requestHandler6(metadata, response) {
    response.setHeader("Content-Type", "application/json", false);
    response.write("function getJSON() { return " + jsonString + "};");
}
