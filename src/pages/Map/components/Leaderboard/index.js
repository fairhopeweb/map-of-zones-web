import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames/bind';
import { useTable, useSortBy, useGlobalFilter } from 'react-table';
import animate from 'animate.css';

import { formatNumber, trackEvent } from 'common/helper';
import { useMobileSize } from 'common/hooks';

import Thead from './Thead';
import SortModal from './SortModal';
import Status from './Status';

import columnsConfig from './config';

import styles from './index.module.css';

const cx = classNames.bind({ ...animate, ...styles });

function Leaderboard({
  data,
  disableMultiSort,
  disableSortRemove,
  focusedZoneId,
  handleScroll,
  initialState,
  isTableOpened,
  onSortChange,
  period,
  setFocusedZone,
}) {
  const globalFilter = useCallback(
    (rows, columnIds, filterValue) => filterValue(rows),
    [],
  );

  const {
    getTableProps,
    getTableBodyProps,
    headerGroups,
    rows,
    prepareRow,
    state,
    columns,
    setHiddenColumns,
  } = useTable(
    {
      data,
      initialState,
      disableMultiSort,
      disableSortRemove,
      globalFilter,
      columns: columnsConfig,
    },
    useGlobalFilter,
    useSortBy,
  );

  const sortBy = useMemo(() => state?.sortBy?.[0], [state]);
  const initialSortBy = useMemo(() => initialState?.sortBy?.[0], [
    initialState,
  ]);
  const sortedColumn = columns.find(({ isSorted }) => isSorted);

  useEffect(() => {
    onSortChange({ id: sortBy.id, desc: sortBy.desc });
  }, [sortBy.id, sortBy.desc, onSortChange]);

  useEffect(() => {
    if (sortBy !== initialSortBy && sortedColumn) {
      trackEvent({
        category: 'Table',
        action: 'sort',
        label: sortedColumn.id,
        extra: { direction: sortBy?.desc ? 'desc' : 'asc' },
      });
    }
  }, [initialSortBy, sortBy, sortedColumn]);

  useEffect(() => {
    let table = document.documentElement.querySelector('table');
    window.addEventListener('scroll', () => handleScroll(table));

    return window.removeEventListener('scroll', () => handleScroll(table));
  }, [handleScroll]);

  const renderCell = cell => {
    switch (cell.column.id) {
      case 'blank':
        return <div>-</div>;
      case 'txsActivity':
        return cell.render('Cell');
      case 'zoneLabelUrl': {
        return (
          <div className={cx('cell-container', 'cell-image-container')}>
            {cell.row.original.zoneLabelUrl ? (
              <img
                className={cx('image-container')}
                src={cell.row.original.zoneLabelUrl}
                alt=""
              />
            ) : (
              <div className={cx('image-empty')} />
            )}
          </div>
        );
      }
      case 'name': {
        return (
          <div className={cx('cell-container')}>
            <span className={cx('text-container')}>{cell.render('Cell')}</span>
            <Status isZoneUpToDate={cell.row.original.isZoneUpToDate} />
            {cell.row.original[sortedColumn.id + 'RatingDiff'] !== 0 && (
              <span
                className={cx('position-shift', {
                  negative:
                    cell.row.original[sortedColumn.id + 'RatingDiff'] < 0,
                })}
              >
                {cell.row.original[sortedColumn.id + 'RatingDiff']}
              </span>
            )}
          </div>
        );
      }
      default:
        return (
          <span className={cx('text-container')}>
            {cell.render('Cell')}
            {!cell.column.disableSortBy && (
              <div
                className={cx('shift-tooltip', {
                  negative: cell.row.original[cell.column.diffAccessor] < 0,
                })}
              >
                {cell.row.original[cell.column.diffAccessor] > 0
                  ? '+' +
                    formatNumber(cell.row.original[cell.column.diffAccessor])
                  : formatNumber(cell.row.original[cell.column.diffAccessor])}
              </div>
            )}
          </span>
        );
    }
  };

  const focusZone = useCallback(
    zone => {
      setFocusedZone(zone);

      if (isTableOpened) {
        window.scrollTo({
          top: 0,
          behavior: 'smooth',
        });
      }

      trackEvent({
        category: 'Table',
        action: 'select zone',
        label: zone.name,
        extra: { period: period?.rawText },
      });
    },
    [setFocusedZone, isTableOpened, period],
  );

  useEffect(() => {
    let table = document.getElementById('table-container');
    let fixedHeader = document.getElementById('fixed-header');
    let fixedRow = document.getElementById('fixed-row');

    const onTableScroll = event => {
      [fixedHeader, fixedRow].forEach(item => {
        if (item) {
          item.style.transform = `translateX(-${event.target.scrollLeft}px)`;
        }
      });
    };

    if (
      isTableOpened === 'fixed-thead' &&
      document.documentElement.clientWidth < 1120
    ) {
      [fixedHeader, fixedRow].forEach(item => {
        if (item) {
          item.style.transform = `translateX(-${table.scrollLeft}px)`;
        }
      });

      table.addEventListener('scroll', onTableScroll);
    }

    return () => {
      table.removeEventListener('scroll', onTableScroll);
    };
  }, [isTableOpened, focusedZoneId]);

  const isMobile = useMobileSize();

  const [selectedColumnIndex, updateSelectedColumnIndex] = useState(0);

  const [isSortModalOpened, setSortModalOpened] = useState(false);

  const hiddenColumns = useMemo(
    () => columns.filter(({ alwaysVisible }) => !alwaysVisible),
    [columns],
  );

  const hiddenColumnsHeaders = useMemo(
    () => hiddenColumns.map(({ Header, id }) => ({ id, value: Header })),
    [hiddenColumns],
  );

  const onHeaderClick = useCallback(
    e => {
      if (isMobile) {
        e.stopPropagation();
        setSortModalOpened(true);
      }
    },
    [setSortModalOpened, isMobile],
  );

  useEffect(() => {
    if (isMobile) {
      const hiddenColumnsIds = hiddenColumns.map(({ id }) => id);

      setHiddenColumns(
        [
          ...hiddenColumnsIds.slice(0, selectedColumnIndex),
          ...hiddenColumnsIds.slice(
            selectedColumnIndex + 1,
            hiddenColumnsIds.length,
          ),
        ],
        true,
      );
    } else {
      setHiddenColumns([], true);
    }
  }, [setHiddenColumns, hiddenColumns, isMobile, selectedColumnIndex]);

  useEffect(() => {
    if (isMobile && columns[selectedColumnIndex + 3]?.toggleSortBy) {
      columns[selectedColumnIndex + 3].toggleSortBy(false, false);
    }
  }, [columns, selectedColumnIndex, isMobile]);

  return (
    <div
      id="table-container"
      className={cx('table-container', { fixedTable: isTableOpened })}
    >
      <table {...getTableProps()} className={cx('table')}>
        <Thead
          headerGroups={headerGroups}
          onHeaderClick={onHeaderClick}
          period={period.rawText}
        />
        <Thead
          fixed
          isTableOpened={isTableOpened}
          headerGroups={headerGroups}
          onHeaderClick={onHeaderClick}
          period={period.rawText}
        />
        <tbody
          {...getTableBodyProps()}
          className={cx(
            { bodyWithFocus: !!focusedZoneId },
            { focusFixed: !!focusedZoneId && isTableOpened === 'fixed-thead' },
          )}
        >
          {rows.map((row, i) => {
            prepareRow(row);
            return (
              <tr
                {...row.getRowProps()}
                className={cx(
                  'row',
                  { focusedRow: row.original.id === focusedZoneId },
                  {
                    fixed:
                      row.original.id === focusedZoneId &&
                      isTableOpened === 'fixed-thead',
                  },
                )}
                onClick={() => {
                  focusZone(row.original);
                }}
                id={
                  row.original.id === focusedZoneId &&
                  isTableOpened === 'fixed-thead'
                    ? 'fixed-row'
                    : ''
                }
              >
                {row.cells.map(cell => {
                  return (
                    <td
                      {...cell.getCellProps()}
                      className={cx('cell', cell.column.id, {
                        sortedColumn: cell.column.isSorted,
                      })}
                    >
                      {renderCell(cell)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <SortModal
        isOpen={isSortModalOpened}
        onRequestClose={() => setSortModalOpened(false)}
        data={hiddenColumnsHeaders}
        selectedIndex={selectedColumnIndex}
        updateSelection={index => {
          updateSelectedColumnIndex(index);
          setSortModalOpened(false);
        }}
      />
    </div>
  );
}

Leaderboard.propTypes = {
  data: PropTypes.array, // TODO
  onSortChange: PropTypes.func,
  initialState: PropTypes.object,
  disableMultiSort: PropTypes.bool,
  disableSortRemove: PropTypes.bool,
  focusedZoneId: PropTypes.string,
  setFocusedZone: PropTypes.func,
  filter: PropTypes.func,
  period: PropTypes.shape({
    hours: PropTypes.number,
    step: PropTypes.number,
    name: PropTypes.node,
    rawText: PropTypes.string,
  }),
};

Leaderboard.defaultProps = {
  onSortChange: () => {},
  disableMultiSort: true,
  disableSortRemove: true,
  setFocusedZone: () => {},
  filter: rows => rows,
};

export default Leaderboard;
