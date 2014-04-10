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
    tasks.push(verifyResult, ["c", "a", "b"], ["a", "b"], 0, ["c"]);
    tasks.push(verifyResult, ["a", "c", "b"], ["a", "b"], 1, ["c"]);
    tasks.push(verifyResult, ["a", "b", "c"], ["a", "b"], 2, ["c"]);
    tasks.push(verifyResult, ["a", "b", "c", "d"], ["a", "b"], 2, ["c", "d"]);
    tasks.push(verifyResult, ["a", "b", "c", "d"], ["a", "d"], 1, ["b", "c"]);
    tasks.push(verifyResult, [1, 2, 3], [1, 3], 1, [2]);
    tasks.push(verifyResult, [new object("Peter"), new object("David"), new object("Frank")],
        [new object("Peter"), new object("Frank")], 1, [new object("David")]);

    tasks.run(() =>
    {
        FBTest.testDone();
    }, 0);
}

function verifyResult(callback, expected, array, index, newItems)
{
    var resultArray = FW.FBL.arrayInsert(array, index, newItems);
    FBTest.compare(expected.toString(), resultArray.toString(),
        "Item(s) must be correctly inserted into the array");

    callback();
}