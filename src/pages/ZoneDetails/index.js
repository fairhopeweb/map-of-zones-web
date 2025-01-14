import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useHistory, useLocation } from 'react-router';
import { parse, stringify } from 'querystringify';

import { removeDuplicatedZoneCounerparties } from 'common/helper';

import Leaderboard from './components/Leaderboard';
// TODO: What is purpose to use two same footers and headers? I Just change this for remove code duplication, but could be return
import Footer from 'pages/Map/components/Footer';
import Header from './components/Header';
import Loader from './components/Loader';
import ZoneDetails from './components/ZoneDetails';
import ZonesPicker from './components/ZonesPicker';

import { useShowTestnet, useZoneStat } from './hooks';

const SORT_BY_PERIOD = {
  24: 'ibc_tx_1d',
  168: 'ibc_tx_7d',
  720: 'ibc_tx_30d',
};

const PERIOD_BY_ID = {
  ibc_tx_1d: 24,
  ibc_tx_1d_failed: 24,
  ibc_tx_7d: 168,
  ibc_tx_7d_failed: 168,
  ibc_tx_30d: 720,
  ibc_tx_30d_failed: 720,
};

const ORDER_SORT = {
  true: 'desc',
  false: 'asc',
};

const getSortBy = (period, tableOrderBy) => {
  return SORT_BY_PERIOD[period] + (tableOrderBy === 'success' ? '' : '_failed');
};

const getOrderBy = columnId => {
  return columnId.includes('failed') ? 'failed' : 'success';
};

function Channel() {
  const location = useLocation();
  const history = useHistory();

  const [isTestnetVisible, toggleShowTestnet] = useShowTestnet();

  const source = useMemo(() => {
    return parse(location.search).source;
  }, [location.search]);

  const options = useMemo(() => {
    const { source, targets } = parse(location.search);

    return {
      variables: { source },
      additionalData: { targets: (targets || '').split(',').filter(Boolean) },
    };
  }, [location.search]);

  const initialState = useMemo(() => {
    const { period, tableOrderBy = 'success', tableOrderSort = 'desc' } = parse(
      location.search,
    );

    return {
      sortBy: [
        {
          id: getSortBy(period, tableOrderBy),
          desc: tableOrderSort === 'desc',
        },
      ],
    };
  }, [location.search]);

  const [showZonesPicker, setShowZonesPicker] = useState(false);
  const [showZoneDetails, setShowZoneDetails] = useState(null);

  const zoneStat = useZoneStat(options, isTestnetVisible);

  const zoneDetails = useMemo(() => {
    const { zoneDetailsChanelId, zoneDetailsChanelCounerparty } = parse(
      location.search,
    );

    if (zoneStat?.selectedNodes) {
      const zone = zoneStat?.selectedNodes.find(
        ({ channel_id, zone_counerparty }) =>
          channel_id === zoneDetailsChanelId &&
          zone_counerparty === zoneDetailsChanelCounerparty,
      );

      return zone;
    }

    return null;
  }, [location.search, zoneStat]);

  const onSortChange = useCallback(
    sort => {
      const search = parse(location.search);

      search.period = PERIOD_BY_ID[sort.id];
      search.tableOrderBy = getOrderBy(sort.id);
      search.tableOrderSort = ORDER_SORT[sort.isSortedDesc];

      if (location.search !== `?${stringify(search)}`) {
        history.push(`/zone?${stringify(search)}`, location.state);
      }
    },
    [history, location.search, location.state],
  );

  const toggleZonesPicker = useCallback(
    () => setShowZonesPicker(prevState => !prevState),
    [setShowZonesPicker],
  );

  const removeZoneDetails = useCallback(() => {
    const search = parse(location.search);

    delete search.zoneDetailsChanelId;
    delete search.zoneDetailsChanelCounerparty;

    history.push(`/zone?${stringify(search)}`, location.state);
  }, [history, location.search, location.state]);

  const toggleZoneDetails = useCallback(
    () => setShowZoneDetails(prevState => !prevState),
    [setShowZoneDetails],
  );

  const preSetFocusedZone = useCallback(
    zone => {
      if (zone) {
        const search = parse(location.search);

        search.zoneDetailsChanelId = zone.channel_id;
        search.zoneDetailsChanelCounerparty = zone.zone_counerparty;

        history.push(`/zone?${stringify(search)}`, location.state);

        toggleZoneDetails();
      }
    },
    [history, location.search, location.state, toggleZoneDetails],
  );

  const selectZones = useCallback(
    newTargets => {
      if (
        newTargets.length ===
        removeDuplicatedZoneCounerparties(zoneStat.nodes).length
      ) {
        const search = parse(location.search);

        delete search.targets;

        history.push(`/zone?${stringify(search)}`, location.state);
      } else {
        const search = parse(location.search);

        search.targets = newTargets
          .map(({ zone_counerparty }) => zone_counerparty)
          .join(',');

        history.push(`/zone?${stringify(search)}`, location.state);
      }
    },
    [history, location.search, location.state, zoneStat],
  );

  const navigateToMainPage = useCallback(() => {
    history.push('/');
  }, [history]);

  const onCloseClick = useCallback(() => {
    if (location.state?.navigateFrom) {
      const search = parse(location.state.navigateFrom.search);

      if (isTestnetVisible) {
        search.testnet = true;
      } else {
        search.testnet = false;
      }

      history.push(
        `${location.state.navigateFrom.pathname}?${stringify(search)}`,
      );
    } else {
      const search = {};

      if (isTestnetVisible) {
        search.testnet = true;
      }

      history.replace(`/?${stringify(search)}`);
    }
  }, [history, isTestnetVisible, location.state]);

  useEffect(() => {
    if (showZoneDetails === null && zoneDetails) {
      toggleZoneDetails();
    }
  }, [showZoneDetails, toggleZoneDetails, zoneDetails]);

  if (!zoneStat) {
    return <Loader />;
  } else {
    return (
      <div>
        <Header
          navigateToMainPage={navigateToMainPage}
          onCloseClick={onCloseClick}
          source={source}
          toggleZonesPicker={toggleZonesPicker}
          zoneStat={zoneStat}
          isTestnetVisible={isTestnetVisible}
          toggleShowTestnet={toggleShowTestnet}
        />
        <Leaderboard
          data={zoneStat.selectedNodes}
          onSortChange={onSortChange}
          setFocusedZone={preSetFocusedZone}
          initialState={initialState}
        />
        <ZoneDetails
          onAfterClose={removeZoneDetails}
          onRequestClose={toggleZoneDetails}
          isOpen={!!showZoneDetails}
          zone={zoneDetails}
        />
        <ZonesPicker
          onRequestClose={toggleZonesPicker}
          isOpen={showZonesPicker}
          zoneStat={zoneStat}
          selectZones={selectZones}
        />
        <Footer />
      </div>
    );
  }
}

export default Channel;
