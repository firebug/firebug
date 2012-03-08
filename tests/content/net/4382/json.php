<?php
    header('Content-Type: text/json');

    if (isset($_GET['type']) && $_GET['type'] == 'array')
        echo '[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]';
    else
        echo '{5: 5, 2: 2, 15: 15, 6: 6, 1: 1, 4: 4, 10: 10, 14: 14, 3: 3, 11: 11, 9: 9, 12: 12, 7: 7, 13: 13, 8: 8}';
?>