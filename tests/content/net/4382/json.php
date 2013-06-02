<?php
    header('Content-Type: text/json');

    if (isset($_GET['type']) && $_GET['type'] == 'array')
        echo '[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]';
    else
        echo '{"a": 1, "c": 2, "b": 3}';
?>