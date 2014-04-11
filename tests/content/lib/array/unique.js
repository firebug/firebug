function runTest()
{
    function object(name)
    {
        this.name = name;
    }

    object.prototype.toString = function()
    {
        return this.name;
    }

    var tasks = new FBTest.TaskList();
    tasks.push(verifyResult, ["a", "b", "c"], ["a", "b", "c"], true);
    tasks.push(verifyResult, ["a", "b", "c"], ["a", "b", "c"], false);
    tasks.push(verifyResult, ["a", "b", "c"], ["a", "a", "b", "c"], true);
    tasks.push(verifyResult, ["a", "b", "c"], ["a", "b", "a", "c"], false);
    tasks.push(verifyResult, ["a", "c", "b"], ["a", "c", "a", "b"], false);
    tasks.push(verifyResult, ["a", "b", "c", "d"], ["a", "b", "c", "a", "d", "b"], false);
    tasks.push(verifyResult, [1, 2, 3], [1, 2, 2, 3], true);
    var peter = new object("Peter");
    var david = new object("David");
    var frank = new object("Frank");
    tasks.push(verifyResult, [peter, david, frank], [peter, david, frank, david], false);

    tasks.run(FBTest.testDone, 0);
}

function verifyResult(callback, expected, array, sorted)
{
    var resultArray = FW.FBL.unique(array, sorted);
    FBTest.compare(expected.toString(), resultArray.toString(),
        "Item(s) must be correctly inserted into the array");

    callback();
}