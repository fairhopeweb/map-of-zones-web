import { useCallback, useMemo } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { parse, stringify } from 'querystringify';

import tableColums from '../components/Leaderboard/config';

const ORDER_SORT = {
  true: 'asc', // swap for querystring misleading
  false: 'desc', // swap for querystring misleading
};

export const useSorting = () => {
  const history = useHistory();
  const location = useLocation();

  const setSort = useCallback(
    newSort => {
      const search = parse(location.search);

      search.tableOrderBy = newSort.id;
      search.tableOrderSort = ORDER_SORT[!!newSort.desc] || ORDER_SORT[false];

      if (location.search !== `?${stringify(search)}`) {
        history.push(`?${stringify(search)}`);
      }
    },
    [history, location.search],
  );

  // TODO: order sort doesn't work
  const sort = useMemo(() => {
    const DEFAULT_TABLE_ORDER_BY = 'ibcVolume';
    const DEFAULT_TABLE_ORDER_SORT = 'desc';
    const { tableOrderBy, tableOrderSort } = parse(location.search);
    const isOrderByValid = tableColums.some(
      ({ id, disableSortBy }) => id === tableOrderBy && !disableSortBy,
    );
    const isOrderSortValid = ['asc', 'desc'].includes(tableOrderSort);

    return {
      tableOrderBy: isOrderByValid ? tableOrderBy : DEFAULT_TABLE_ORDER_BY,
      tableOrderSort: isOrderSortValid
        ? tableOrderSort
        : DEFAULT_TABLE_ORDER_SORT,
    };
  }, [location.search]);

  return [sort, setSort];
};
