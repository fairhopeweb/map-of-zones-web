import { useMemo } from 'react';
import gql from 'graphql-tag';
import { Graph } from '@dagrejs/graphlib';

import { getIsUptrend, getNodeColor, transformChartData } from 'common/helper';
import { useRealtimeQuery } from 'common/hooks';

const ZONES_STAT_FRAGMENT = gql`
  fragment stat on zones_stats {
    zone
    chart_cashflow
    total_txs
    total_ibc_txs
    ibc_percent
    ibc_tx_in
    ibc_tx_out
    channels_num
    channels_cnt_open
    channels_cnt_active_period
    channels_percent_active_period
    ibc_transfers_weight
    ibc_transfers_mainnet_weight
    total_txs_weight
    total_txs_mainnet_weight
    ibc_tx_in_weight
    ibc_tx_in_mainnet_weight
    ibc_tx_out_weight
    ibc_tx_out_mainnet_weight
    total_txs_diff
    ibc_transfers_pending
    ibc_tx_out_diff
    ibc_tx_in_diff
    total_txs_rating
    total_txs_rating_diff
    total_txs_mainnet_rating
    total_txs_mainnet_rating_diff
    ibc_tx_out_rating
    ibc_tx_out_rating_diff
    ibc_tx_out_mainnet_rating
    ibc_tx_out_mainnet_rating_diff
    ibc_tx_in_rating
    ibc_tx_in_rating_diff
    ibc_tx_in_mainnet_rating
    ibc_tx_in_mainnet_rating_diff
    ibc_active_addresses
    ibc_active_addresses_diff
    ibc_active_addresses_weight
    ibc_active_addresses_mainnet_weight
    ibc_tx_failed
    success_rate
    ibc_tx_out_failed
    ibc_tx_in_failed
    ibc_tx_failed_diff
    ibc_active_addresses_rating
    ibc_active_addresses_rating_diff
    ibc_active_addresses_mainnet_rating
    ibc_active_addresses_mainnet_rating_diff
    is_zone_up_to_date
    is_zone_mainnet
    zone_readable_name
    zone_label_url
    zone_label_url2
    ibc_cashflow
    ibc_cashflow_out
    ibc_cashflow_in
    ibc_peers
    ibc_peers_mainnet
    ibc_cashflow_out_percent
    ibc_cashflow_in_percent
    ibc_cashflow_diff
    ibc_cashflow_pending
    ibc_cashflow_rating
    ibc_cashflow_mainnet_rating
    ibc_cashflow_rating_diff
    ibc_cashflow_mainnet_rating_diff
    ibc_cashflow_weight
    ibc_cashflow_mainnet_weight
    ibc_cashflow_in_weight
    ibc_cashflow_in_mainnet_weight
    ibc_cashflow_out_weight
    ibc_cashflow_out_mainnet_weight
    ibc_cashflow_out_diff
    ibc_cashflow_in_diff
    ibc_cashflow_out_rating
    ibc_cashflow_out_mainnet_rating
    ibc_cashflow_out_rating_diff
    ibc_cashflow_out_mainnet_rating_diff
    ibc_cashflow_in_rating
    ibc_cashflow_in_mainnet_rating
    ibc_cashflow_in_rating_diff
    ibc_cashflow_in_mainnet_rating_diff
    ibc_cashflow_in_pending
    ibc_cashflow_out_pending
    ibc_transfers
    ibc_transfers_diff
    ibc_transfers_rating
    ibc_transfers_mainnet_rating
    ibc_transfers_rating_diff
    ibc_transfers_mainnet_rating_diff
  }
`;

const ZONES_GRAPH_FRAGMENT = gql`
  fragment graph on zones_graphs {
    source
    target
    channels_cnt_open
    channels_cnt_active
    channels_percent_active
    ibc_transfers
    ibc_transfers_pending
    ibc_cashflow
    ibc_cashflow_pending
  }
`;

const ZONES_STAT_QUERY = gql`
  query ZonesStat($period: Int!) {
    zones_stats(
      where: { timeframe: { _eq: $period } }
      order_by: { ibc_tx_in: asc, zone: asc }
    ) {
      ...stat
    }
    zones_graphs(where: { timeframe: { _eq: $period } }) {
      ...graph
    }
  }
  ${ZONES_STAT_FRAGMENT}
  ${ZONES_GRAPH_FRAGMENT}
`;

const ZONES_STAT_SUBSCRIPTION = gql`
  subscription ZonesStat($period: Int!) {
    zones_stats(
      where: { timeframe: { _eq: $period } }
      order_by: { ibc_tx_in: asc, zone: asc }
    ) {
      ...stat
    }
    zones_graphs(where: { timeframe: { _eq: $period } }) {
      ...graph
    }
  }
  ${ZONES_STAT_FRAGMENT}
  ${ZONES_GRAPH_FRAGMENT}
`;

const ZONES_STAT_QUERY_ONLY_MAINNET = gql`
  query ZonesStat($period: Int!) {
    zones_stats(
      where: { timeframe: { _eq: $period }, is_zone_mainnet: { _eq: true } }
      order_by: { ibc_tx_in: asc, zone: asc }
    ) {
      ...stat
    }
    zones_graphs(
      where: { timeframe: { _eq: $period }, is_mainnet: { _eq: true } }
    ) {
      ...graph
    }
  }
  ${ZONES_STAT_FRAGMENT}
  ${ZONES_GRAPH_FRAGMENT}
`;

const ZONES_STAT_SUBSCRIPTION_ONLY_MAINNET = gql`
  subscription ZonesStat($period: Int!) {
    zones_stats(
      where: { timeframe: { _eq: $period }, is_zone_mainnet: { _eq: true } }
      order_by: { ibc_tx_in: asc, zone: asc }
    ) {
      ...stat
    }
    zones_graphs(
      where: { timeframe: { _eq: $period }, is_mainnet: { _eq: true } }
    ) {
      ...graph
    }
  }
  ${ZONES_STAT_FRAGMENT}
  ${ZONES_GRAPH_FRAGMENT}
`;

const DEFAULT_COLOR = '#72727A';

const createGraph = (nodes, links) => {
  const g = new Graph();

  nodes.forEach(node => g.setNode(node.id, node));
  links.forEach(({ source, target }) => g.setEdge(source, target));

  return g;
};

const getScaleParams = (zones, key, isTestnetVisible) => {
  const weights = zones.map(({ [key]: weight }) => weight).filter(Boolean);

  if (!weights.length) {
    return [1, 1];
  }

  const minWeight = Math.min(...weights);
  const min = weights.length === zones.length ? minWeight : minWeight / 2;
  const scale = min < 1 ? 1 / min : min;

  return [min, scale * (isTestnetVisible ? 1 : 3)];
};

const getNodeWeight = (val, min, scale) => Math.log2((val || min) * scale) + 1;

const transform = (data, isTestnetVisible) => {
  const zones = data?.zones_stats;
  const graph = data?.zones_graphs;

  if (!zones || !graph) {
    return null;
  }

  const [minIbcTxsWeight, ibcTxsScale] = getScaleParams(
    zones,
    isTestnetVisible ? 'ibc_transfers_weight' : 'ibc_transfers_mainnet_weight',
    isTestnetVisible,
  );
  const [minIbcVolumeWeight, ibcVolumeScale] = getScaleParams(
    zones,
    isTestnetVisible ? 'ibc_cashflow_weight' : 'ibc_cashflow_mainnet_weight',
    isTestnetVisible,
  );
  const [minTxsWeight, txsScale] = getScaleParams(
    zones,
    isTestnetVisible ? 'total_txs_weight' : 'total_txs_mainnet_weight',
    isTestnetVisible,
  );
  const [minIbcReceivedWeight, ibcReceivedScale] = getScaleParams(
    zones,
    isTestnetVisible ? 'ibc_tx_in_weight' : 'ibc_tx_in_mainnet_weight',
    isTestnetVisible,
  );
  const [minIbcVolumeReceivedWeight, ibcVolumeReceivedScale] = getScaleParams(
    zones,
    isTestnetVisible
      ? 'ibc_cashflow_in_weight'
      : 'ibc_cashflow_in_mainnet_weight',
    isTestnetVisible,
  );
  const [minIbcSentWeight, ibcSentScale] = getScaleParams(
    zones,
    isTestnetVisible ? 'ibc_tx_out_weight' : 'ibc_tx_out_mainnet_weight',
    isTestnetVisible,
  );
  const [minIbcVolumeSentWeight, ibcVolumeSentScale] = getScaleParams(
    zones,
    isTestnetVisible
      ? 'ibc_cashflow_out_weight'
      : 'ibc_cashflow_out_mainnet_weight',
    isTestnetVisible,
  );

  let zonesFormatted = zones.map(
    ({
      zone,
      chart_cashflow,
      total_txs,
      total_ibc_txs,
      ibc_percent,
      ibc_tx_in,
      ibc_tx_out,
      channels_num,
      channels_cnt_open,
      channels_cnt_active_period,
      channels_percent_active_period,
      ibc_transfers_weight,
      ibc_transfers_mainnet_weight,
      total_txs_weight,
      total_txs_mainnet_weight,
      ibc_tx_in_weight,
      ibc_tx_in_mainnet_weight,
      ibc_tx_out_weight,
      ibc_tx_out_mainnet_weight,
      total_txs_diff,
      ibc_tx_out_diff,
      ibc_tx_in_diff,
      total_txs_rating,
      total_txs_rating_diff,
      total_txs_mainnet_rating,
      total_txs_mainnet_rating_diff,
      ibc_tx_out_rating,
      ibc_tx_out_rating_diff,
      ibc_tx_out_mainnet_rating,
      ibc_tx_out_mainnet_rating_diff,
      ibc_tx_in_rating,
      ibc_tx_in_rating_diff,
      ibc_tx_in_mainnet_rating,
      ibc_tx_in_mainnet_rating_diff,
      ibc_active_addresses,
      ibc_active_addresses_diff,
      ibc_active_addresses_weight,
      ibc_active_addresses_mainnet_weight,
      ibc_tx_failed,
      success_rate,
      ibc_tx_out_failed,
      ibc_tx_in_failed,
      ibc_tx_failed_diff,
      ibc_active_addresses_rating,
      ibc_active_addresses_rating_diff,
      ibc_active_addresses_mainnet_rating,
      ibc_active_addresses_mainnet_rating_diff,
      is_zone_up_to_date,
      is_zone_mainnet,
      zone_readable_name,
      zone_label_url,
      zone_label_url2,
      ibc_cashflow,
      ibc_cashflow_out,
      ibc_cashflow_in,
      ibc_peers,
      ibc_peers_mainnet,
      ibc_cashflow_out_percent,
      ibc_cashflow_in_percent,
      ibc_cashflow_diff,
      ibc_cashflow_pending,
      ibc_transfers_pending,
      ibc_cashflow_rating,
      ibc_cashflow_mainnet_rating,
      ibc_cashflow_rating_diff,
      ibc_cashflow_mainnet_rating_diff,
      ibc_cashflow_weight,
      ibc_cashflow_mainnet_weight,
      ibc_cashflow_in_weight,
      ibc_cashflow_in_mainnet_weight,
      ibc_cashflow_out_weight,
      ibc_cashflow_out_mainnet_weight,
      ibc_cashflow_out_diff,
      ibc_cashflow_in_diff,
      ibc_cashflow_out_rating,
      ibc_cashflow_out_mainnet_rating,
      ibc_cashflow_out_rating_diff,
      ibc_cashflow_out_mainnet_rating_diff,
      ibc_cashflow_in_rating,
      ibc_cashflow_in_mainnet_rating,
      ibc_cashflow_in_rating_diff,
      ibc_cashflow_in_mainnet_rating_diff,
      ibc_cashflow_in_pending,
      ibc_cashflow_out_pending,
      ibc_transfers,
      ibc_transfers_diff,
      ibc_transfers_rating,
      ibc_transfers_mainnet_rating,
      ibc_transfers_rating_diff,
      ibc_transfers_mainnet_rating_diff,
    }) => {
      return {
        id: zone,
        name: zone_readable_name,
        txsActivity: transformChartData(chart_cashflow, 'txs'),
        totalTxs: total_txs,
        ibcTransfers: ibc_transfers,
        ibcPercentage: ibc_percent ? ibc_percent / 100 : ibc_percent,
        ibcSent: ibc_tx_out,
        ibcVolume: ibc_cashflow,
        ibcVolumeSent: ibc_cashflow_out,
        ibcVolumeReceived: ibc_cashflow_in,
        peers: isTestnetVisible ? ibc_peers : ibc_peers_mainnet,
        ibcVolumeSentPercentage: ibc_cashflow_out_percent
          ? ibc_cashflow_out_percent / 100
          : ibc_cashflow_out_percent,
        ibcVolumeReceivedPercentage: ibc_cashflow_in_percent
          ? ibc_cashflow_in_percent / 100
          : ibc_cashflow_in_percent,
        ibcSentPercentage: ibc_tx_out / total_ibc_txs || 0,
        ibcReceived: ibc_tx_in,
        ibcReceivedPercentage: ibc_tx_in / total_ibc_txs || 0,
        channels: channels_num,
        openChannels: channels_cnt_open,
        activeChannels: channels_cnt_active_period,
        activeChannelsPercent: channels_percent_active_period,
        totalTxsDiff: total_txs_diff,
        ibcTransfersDiff: ibc_transfers_diff,
        ibcVolumeDiff: ibc_cashflow_diff,
        ibcVolumePending: ibc_cashflow_pending,
        ibcVolumeReceivedPending: ibc_cashflow_in_pending,
        ibcVolumeSentPending: ibc_cashflow_out_pending,
        ibcTransfersPending: ibc_transfers_pending,
        ibcSentDiff: ibc_tx_out_diff,
        ibcVolumeSentDiff: ibc_cashflow_out_diff,
        ibcReceivedDiff: ibc_tx_in_diff,
        ibcVolumeReceivedDiff: ibc_cashflow_in_diff,
        totalTxsRating: isTestnetVisible
          ? total_txs_rating
          : total_txs_mainnet_rating,
        totalTxsRatingDiff: isTestnetVisible
          ? total_txs_rating_diff
          : total_txs_mainnet_rating_diff,
        ibcTransfersRating: isTestnetVisible
          ? ibc_transfers_rating
          : ibc_transfers_mainnet_rating,
        ibcVolumeRating: isTestnetVisible
          ? ibc_cashflow_rating
          : ibc_cashflow_mainnet_rating,
        ibcTransfersRatingDiff: isTestnetVisible
          ? ibc_transfers_rating_diff
          : ibc_transfers_mainnet_rating_diff,
        ibcVolumeRatingDiff: isTestnetVisible
          ? ibc_cashflow_rating_diff
          : ibc_cashflow_mainnet_rating_diff,
        ibcSentRating: isTestnetVisible
          ? ibc_tx_out_rating
          : ibc_tx_out_mainnet_rating,
        ibcVolumeSentRating: isTestnetVisible
          ? ibc_cashflow_out_rating
          : ibc_cashflow_out_mainnet_rating,
        ibcSentRatingDiff: isTestnetVisible
          ? ibc_tx_out_rating_diff
          : ibc_tx_out_mainnet_rating_diff,
        ibcVolumeSentRatingDiff: isTestnetVisible
          ? ibc_cashflow_out_rating_diff
          : ibc_cashflow_out_mainnet_rating_diff,
        ibcReceivedRating: isTestnetVisible
          ? ibc_tx_in_rating
          : ibc_tx_in_mainnet_rating,
        ibcVolumeReceivedRating: isTestnetVisible
          ? ibc_cashflow_in_rating
          : ibc_cashflow_in_mainnet_rating,
        ibcReceivedRatingDiff: isTestnetVisible
          ? ibc_tx_in_rating_diff
          : ibc_tx_in_mainnet_rating_diff,
        ibcVolumeReceivedRatingDiff: isTestnetVisible
          ? ibc_cashflow_in_rating_diff
          : ibc_cashflow_in_mainnet_rating_diff,
        ibcActiveAddresses: ibc_active_addresses,
        ibcActiveAddressesDiff: ibc_active_addresses_diff,
        ibcActiveAddressesWeight:
          (isTestnetVisible
            ? ibc_active_addresses_weight
            : ibc_active_addresses_mainnet_weight || 0.15) *
            10 +
          1,
        ibcTxFailed: ibc_tx_failed,
        ibcTxOutFailed: ibc_tx_out_failed,
        ibcTxInFailed: ibc_tx_in_failed,
        successRate: success_rate / 100,
        ibcTxFailedDiff: ibc_tx_failed_diff,
        ibcActiveAddressesRating: isTestnetVisible
          ? ibc_active_addresses_rating
          : ibc_active_addresses_mainnet_rating,
        ibcActiveAddressesRatingDiff: isTestnetVisible
          ? ibc_active_addresses_rating_diff
          : ibc_active_addresses_mainnet_rating_diff,
        color: total_ibc_txs
          ? getNodeColor(ibc_tx_out / total_ibc_txs)
          : DEFAULT_COLOR,
        ibcTransfersWeight: getNodeWeight(
          isTestnetVisible
            ? ibc_transfers_weight
            : ibc_transfers_mainnet_weight,
          minIbcTxsWeight,
          ibcTxsScale,
        ),
        ibcVolumeWeight: getNodeWeight(
          isTestnetVisible ? ibc_cashflow_weight : ibc_cashflow_mainnet_weight,
          minIbcVolumeWeight,
          ibcVolumeScale,
        ),
        txsWeight: getNodeWeight(
          isTestnetVisible ? total_txs_weight : total_txs_mainnet_weight,
          minTxsWeight,
          txsScale,
        ),
        ibcReceivedWeight: getNodeWeight(
          isTestnetVisible ? ibc_tx_in_weight : ibc_tx_in_mainnet_weight,
          minIbcReceivedWeight,
          ibcReceivedScale,
        ),
        ibcSentWeight: getNodeWeight(
          isTestnetVisible ? ibc_tx_out_weight : ibc_tx_out_mainnet_weight,
          minIbcSentWeight,
          ibcSentScale,
        ),
        ibcVolumeReceivedWeight: getNodeWeight(
          isTestnetVisible
            ? ibc_cashflow_in_weight
            : ibc_cashflow_in_mainnet_weight,
          minIbcVolumeReceivedWeight,
          ibcVolumeReceivedScale,
        ),
        ibcVolumeSentWeight: getNodeWeight(
          isTestnetVisible
            ? ibc_cashflow_out_weight
            : ibc_cashflow_out_mainnet_weight,
          minIbcVolumeSentWeight,
          ibcVolumeSentScale,
        ),
        isZoneUpToDate: is_zone_up_to_date,
        isZoneMainnet: is_zone_mainnet,
        zoneLabelUrl: zone_label_url,
        zoneLabelUrlBig: zone_label_url2,
      };
    },
  );

  let linksFormatted = graph.map(
    ({
      source,
      target,
      channels_cnt_open,
      channels_cnt_active,
      channels_percent_active,
      ibc_transfers,
      ibc_transfers_pending,
      ibc_cashflow,
      ibc_cashflow_pending,
    }) => ({
      source,
      target,
      ibcTxs: ibc_transfers,
      ibcTxsPending: ibc_transfers_pending,
      ibcVolume: ibc_cashflow,
      ibcVolumePending: ibc_cashflow_pending,
      openedChannels: channels_cnt_open,
      activeChannels: channels_cnt_active,
      activeChannelsPercent: channels_percent_active,
    }),
  );

  return {
    nodes: zonesFormatted,
    links: linksFormatted,
    graph: createGraph(zonesFormatted, linksFormatted),
  };
};

export const useZonesStat = (options, isTestnetVisible) => {
  const zones = useRealtimeQuery(
    isTestnetVisible ? ZONES_STAT_QUERY : ZONES_STAT_QUERY_ONLY_MAINNET,
    isTestnetVisible
      ? ZONES_STAT_SUBSCRIPTION
      : ZONES_STAT_SUBSCRIPTION_ONLY_MAINNET,
    options,
  );

  // TODO: Try to avoid passing isTestnetVisible to transform function
  return useMemo(() => transform(zones, isTestnetVisible), [zones]);
};

export const useZonesStatFiltered = (zonesStat, filter) => {
  return useMemo(() => {
    if (
      filter?.columnId &&
      ((filter?.sortOrder && filter?.filterAmount) || filter?.trendLine)
    ) {
      let nodes = [...(zonesStat?.nodes || [])];
      let links = [...(zonesStat?.links || [])];

      if (filter?.trendLine) {
        nodes = nodes.filter(node => {
          const isUptrend = getIsUptrend(node.txsActivity);

          return filter.trendLine === 'asc' ? isUptrend : !isUptrend;
        });
      }

      if (filter?.sortOrder && filter.filterAmount) {
        nodes = nodes
          .reverse()
          .sort(
            (a, b) =>
              (filter.sortOrder === 'desc' ? b : a)[filter.columnId] -
              (filter.sortOrder === 'desc' ? a : b)[filter.columnId],
          )
          .slice(0, filter.filterAmount);
      }

      links = links.map(({ source, target, ...restLinkData }) => ({
        ...restLinkData,
        source: source?.id || source,
        target: target?.id || target,
      }));

      links = links.filter(
        ({ source, target }) =>
          !!nodes.find(({ id }) => id === source) &&
          !!nodes.find(({ id }) => id === target),
      );

      return {
        nodes,
        links,
        graph: createGraph(nodes, links),
      };
    }

    return zonesStat;
  }, [filter, zonesStat]);
};
