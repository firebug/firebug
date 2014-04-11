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

    verifyResult(["a", "b", "c"], ["a", "b", "c"], true);
    verifyResult(["a", "b", "c"], ["a", "b", "c"], false);
    verifyResult(["a", "b", "c"], ["a", "a", "b", "c"], true);
    verifyResult(["a", "b", "c"], ["a", "b", "a", "c"], false);
    verifyResult(["a", "c", "b"], ["a", "c", "a", "b"], false);
    verifyResult(["a", "b", "c", "d"], ["a", "b", "c", "a", "d", "b"], false);
    verifyResult([1, 2, 3], [1, 2, 2, 3], true);
    var peter = new object("Peter");
    var david = new object("David");
    var frank = new object("Frank");
    verifyResult([peter, david, frank], [peter, david, frank, david], false);

    FBTest.testDone();
}

function verifyResult(expected, array, sorted)
{
    var resultArray = FW.FBL.unique(array, sorted);
    FBTest.compare(expected.toString(), resultArray.toString(),
        "Duplicate item" + (array.length - expected.length !== 1 ? "s" : "") +
        " must be removed from the array");
}